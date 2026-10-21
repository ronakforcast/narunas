"""API endpoints for the trade flow explorer."""
from __future__ import annotations

import json
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "trade.db"

router = APIRouter(prefix="/api")

# How many intermediaries / products to return per pair
N_INTERMEDIARIES = 10
N_PRODUCTS = 6


def get_db() -> sqlite3.Connection:
    if not DB.exists():
        raise HTTPException(
            status_code=503,
            detail=f"database not built yet ({DB}); run `make build-db`",
        )
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn


def _series(
    conn: sqlite3.Connection, table: str, exporter: str, importer: str
) -> dict:
    rows = conn.execute(
        f"SELECT year, value FROM {table} WHERE exporter=? AND importer=? "
        "ORDER BY year",
        (exporter, importer),
    ).fetchall()
    return {int(r["year"]): r["value"] for r in rows}


def _direct_products(
    conn: sqlite3.Connection, exporter: str, importer: str, year: int
) -> list[dict]:
    rows = conn.execute(
        "SELECT h.hs6, h.value, p.description FROM flows_goods_hs6 h "
        "LEFT JOIN products p ON p.hs6 = h.hs6 "
        "WHERE h.year=? AND h.exporter=? AND h.importer=? "
        "ORDER BY h.value DESC LIMIT ?",
        (year, exporter, importer, N_PRODUCTS),
    ).fetchall()
    return [
        {
            "hs6": r["hs6"],
            "description": r["description"],
            "value_musd": round(r["value"], 1),
        }
        for r in rows
    ]


def _indirect(
    conn: sqlite3.Connection, year: int, exporter: str, importer: str
) -> list[dict]:
    rows = conn.execute(
        "SELECT i.intermediary, i.estimate, i.top_products, c.name "
        "FROM indirect_goods i LEFT JOIN countries c "
        "ON c.iso3 = i.intermediary "
        "WHERE i.year=? AND i.exporter=? AND i.importer=? "
        "ORDER BY i.estimate DESC LIMIT ?",
        (year, exporter, importer, N_INTERMEDIARIES),
    ).fetchall()
    out = []
    for r in rows:
        try:
            prods = json.loads(r["top_products"] or "[]")
        except json.JSONDecodeError:
            prods = []
        out.append(
            {
                "intermediary": r["intermediary"],
                "name": r["name"],
                "estimate_musd": round(r["estimate"], 1),
                "top_products": [
                    {"hs4": code, "value_musd": round(v, 1)}
                    for code, v in prods[:N_PRODUCTS]
                ],
            }
        )
    return out


def _tiva(conn: sqlite3.Connection, origin: str, dest: str) -> dict:
    rows = conn.execute(
        "SELECT year, measure, value FROM tiva WHERE origin=? AND dest=? "
        "ORDER BY year",
        (origin, dest),
    ).fetchall()
    series: dict[str, dict[int, float]] = {}
    for r in rows:
        series.setdefault(r["measure"], {})[int(r["year"])] = r["value"]
    return series


def _year_grid(series: dict[int, float], all_years: list[int]) -> list:
    return [round(series.get(y) or 0.0, 1) for y in all_years]


# ---------------------------------------------------------------------------
# Monthly freshness layer — Eurostat Comext (free, no key, live)
# ---------------------------------------------------------------------------

_COMEXT_URL = (
    "https://ec.europa.eu/eurostat/api/comext/dissemination/sdmx/2.1/data/"
    "DS-045409/M.{reporter}.{partner}.TOTAL.2.VALUE_IN_EUROS"
    "?startPeriod={start}&format=JSON"
)
_MONTHLY_TTL = 6 * 3600  # cache Eurostat responses for 6 hours
_monthly_cache: dict[tuple[str, str], tuple[float, dict]] = {}


def _fetch_monthly_direction(reporter: str, partner: str, start: str) -> list[dict]:
    """Monthly exports reporter -> partner from Eurostat Comext, in EUR millions.

    Kept as a module-level function so tests can monkeypatch it.
    """
    url = _COMEXT_URL.format(reporter=reporter, partner=partner, start=start)
    req = urllib.request.Request(
        url, headers={"User-Agent": "trade-flow-explorer/1.0"}
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.load(r)
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        return []
    index = (
        data.get("dimension", {}).get("time", {}).get("category", {}).get("index", {})
    )
    if not index:
        return []
    values = data.get("value", {})
    out = []
    for period, idx in sorted(index.items(), key=lambda kv: kv[1]):
        v = values.get(str(idx))
        if v is not None:
            out.append({"period": period, "value_meur": round(float(v) / 1e6, 1)})
    return out


def _months_back(n: int, today: date | None = None) -> str:
    today = today or date.today()
    y, m = today.year, today.month - n
    while m <= 0:
        m += 12
        y -= 1
    return f"{y:04d}-{m:02d}"


@router.get("/monthly")
def monthly(fr: str = Query(..., alias="from"), to: str = Query(..., alias="to")) -> dict:
    """Live monthly trade (Eurostat Comext) for a pair — both directions, EUR.

    Available when at least one of the two countries reports monthly trade to
    Eurostat (all EU members + many partners). Values are in millions of EUR,
    exports direction (reporter -> partner), last 24 months.
    """
    fr, to = fr.upper(), to.upper()
    if fr == to:
        raise HTTPException(400, "from and to must differ")

    now = time.time()
    cached = _monthly_cache.get((fr, to))
    if cached and now - cached[0] < _MONTHLY_TTL:
        return cached[1]

    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT iso3, iso2 FROM countries WHERE iso3 IN (?, ?)", (fr, to)
        ).fetchall()
        iso2 = {r["iso3"]: r["iso2"] for r in rows}
        if fr not in iso2 or to not in iso2:
            raise HTTPException(404, f"unknown country code: {fr} or {to}")
    finally:
        conn.close()

    if not iso2.get(fr) or not iso2.get(to):
        body = {
            "available": False,
            "reason": "no monthly reporting for this pair",
            "from": fr,
            "to": to,
        }
        _monthly_cache[(fr, to)] = (now, body)
        return body

    start = _months_back(24)
    ab = _fetch_monthly_direction(iso2[fr], iso2[to], start)
    ba = _fetch_monthly_direction(iso2[to], iso2[fr], start)
    if not ab and not ba:
        body = {
            "available": False,
            "reason": "no monthly data reported by either side",
            "from": fr,
            "to": to,
        }
        _monthly_cache[(fr, to)] = (now, body)
        return body

    body = {
        "available": True,
        "currency": "EUR",
        "from": fr,
        "to": to,
        "from_to": ab,
        "to_from": ba,
        "source": "Eurostat Comext (monthly, reported)",
    }
    _monthly_cache[(fr, to)] = (now, body)
    return body


@router.get("/countries")
def countries() -> list[dict]:
    conn = get_db()
    try:
        rows = conn.execute(
            "SELECT iso3, name, iso2 FROM countries ORDER BY name"
        ).fetchall()
        return [
            {"iso3": r["iso3"], "name": r["name"], "iso2": r["iso2"]}
            for r in rows
        ]
    finally:
        conn.close()


@router.get("/pair")
def pair(
    fr: str = Query(..., alias="from"),
    to: str = Query(..., alias="to"),
) -> dict:
    fr, to = fr.upper(), to.upper()
    if fr == to:
        raise HTTPException(400, "from and to must differ")
    conn = get_db()
    try:
        known = {r["iso3"] for r in conn.execute("SELECT iso3 FROM countries")}
        for code in (fr, to):
            if code not in known:
                raise HTTPException(404, f"unknown country code: {code}")

        goods_ab = _series(conn, "direct_goods", fr, to)
        goods_ba = _series(conn, "direct_goods", to, fr)
        serv_ab = _series(conn, "direct_services", fr, to)
        serv_ba = _series(conn, "direct_services", to, fr)

        years = sorted(set(goods_ab) | set(goods_ba)) or [2024]
        latest = years[-1]

        tiva_raw = _tiva(conn, fr, to)
        tiva_years = sorted(
            set().union(*[set(v) for v in tiva_raw.values()])
            if tiva_raw
            else []
        )

        meta = {
            r["key"]: r["value"]
            for r in conn.execute("SELECT key, value FROM meta")
        }

        return {
            "from": fr,
            "to": to,
            "goods": {
                "years": years,
                "from_to": _year_grid(goods_ab, years),
                "to_from": _year_grid(goods_ba, years),
                "from_to_products": _direct_products(conn, fr, to, latest),
                "to_from_products": _direct_products(conn, to, fr, latest),
            },
            "services": {
                "years": sorted(set(serv_ab) | set(serv_ba)),
                "from_to": None if not serv_ab else _year_grid(
                    serv_ab, sorted(serv_ab)
                ),
                "to_from": None if not serv_ba else _year_grid(
                    serv_ba, sorted(serv_ba)
                ),
            },
            "indirect": {
                "year": latest,
                "from_to": _indirect(conn, latest, fr, to),
                "to_from": _indirect(conn, latest, to, fr),
            },
            "tiva": {
                "years": tiva_years,
                "measures": {
                    m: _year_grid(v, tiva_years)
                    for m, v in tiva_raw.items()
                },
            },
            "meta": meta,
        }
    finally:
        conn.close()
