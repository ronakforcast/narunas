#!/usr/bin/env python3
"""Export static per-country pair data for the hosted (GitHub Pages) version.

Writes web/public/data/:
  countries.json         — country list, data vintages
  pairs/{ISO3}.json.gz   — pair data for {ISO3} vs every partner, BOTH
                           directions (all rows touching {ISO3})

Compact per-partner shape (adapted to PairData in the frontend):
  {
    "g": {"y": [years], "ft": [A->B values], "tf": [B->A values],
           "fp": [[hs6, desc, value], ...], "tp": [[hs6, desc, value], ...]},
    "s": {"y": [...], "ft": [...], "tf": [...]},
    "i": [[iso3, estimate, [[hs4, value], ...]], ...],       // A->B indirect
    "ir": [[iso3, estimate, [...]], ...],                     // B->A indirect
    "t": {"years": [...], "FFD_DVA": [...], ...}             // TiVA measures
  }

Usage: python3 scripts/export_static.py
"""
from __future__ import annotations

import gzip
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "trade.db"
OUT = ROOT / "web" / "public" / "data"

INDIRECT_YEAR = 2024
N_PRODUCTS = 6
N_INDIRECT = 10
N_INDIRECT_PRODUCTS = 3


def log(msg: str) -> None:
    print(f"[export {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def indexes(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_dg_e ON direct_goods (exporter, year);
        CREATE INDEX IF NOT EXISTS idx_dg_i ON direct_goods (importer, year);
        CREATE INDEX IF NOT EXISTS idx_ds_e ON direct_services (exporter, year);
        CREATE INDEX IF NOT EXISTS idx_ds_i ON direct_services (importer, year);
        CREATE INDEX IF NOT EXISTS idx_tiva_o ON tiva (origin);
        CREATE INDEX IF NOT EXISTS idx_tiva_d ON tiva (dest);
        CREATE INDEX IF NOT EXISTS idx_ig_e ON indirect_goods (exporter);
        CREATE INDEX IF NOT EXISTS idx_ig_i ON indirect_goods (importer);
        CREATE INDEX IF NOT EXISTS idx_hs6_i ON flows_goods_hs6 (importer, year);
        """
    )
    conn.commit()


def build_country(conn: sqlite3.Connection, iso: str) -> dict:
    """All pair data for `iso` vs every partner, both directions."""
    partners: dict[str, dict] = {}

    def slot(p: str) -> dict:
        return partners.setdefault(p, {})

    # goods (annual totals, both directions, always from iso's perspective)
    series: dict[str, dict[str, list]] = {}
    for y, e, i, v in conn.execute(
        "SELECT year, exporter, importer, value FROM direct_goods "
        "WHERE exporter=? OR importer=? ORDER BY year",
        (iso, iso),
    ):
        series.setdefault(e, {}).setdefault(i, {})[y] = v
    partner_set = set(series.get(iso, {}).keys())
    for e, imps in series.items():
        if e != iso and iso in imps:
            partner_set.add(e)
    for partner in partner_set:
        ft_data = series.get(iso, {}).get(partner, {})   # iso -> partner
        tf_data = series.get(partner, {}).get(iso, {})   # partner -> iso
        years = sorted(set(ft_data) | set(tf_data))
        slot(partner)["g"] = {
            "y": years,
            "ft": [round(ft_data.get(y) or 0.0, 1) for y in years],
            "tf": [round(tf_data.get(y) or 0.0, 1) for y in years],
        }

    # top direct products (2024, both directions)
    for e, i, hs6, desc, v in conn.execute(
        "SELECT h.exporter, h.importer, h.hs6, p.description, h.value "
        "FROM flows_goods_hs6 h LEFT JOIN products p ON p.hs6 = h.hs6 "
        "WHERE h.year=? AND (h.exporter=? OR h.importer=?) "
        "ORDER BY h.value DESC",
        (INDIRECT_YEAR, iso, iso),
    ):
        if e == iso:
            s = slot(i)
            g = s.setdefault("g", {})
            g.setdefault("fp", []).append([hs6, desc, round(v, 1)])
        else:
            s = slot(e)
            g = s.setdefault("g", {})
            g.setdefault("tp", []).append([hs6, desc, round(v, 1)])
    for p, s in partners.items():
        g = s.get("g", {})
        g["fp"] = (g.get("fp") or [])[:N_PRODUCTS]
        g["tp"] = (g.get("tp") or [])[:N_PRODUCTS]

    # services (both directions, from iso's perspective)
    series.clear()
    for y, e, i, v in conn.execute(
        "SELECT year, exporter, importer, value FROM direct_services "
        "WHERE exporter=? OR importer=? ORDER BY year",
        (iso, iso),
    ):
        series.setdefault(e, {}).setdefault(i, {})[y] = v
    partner_set = set(series.get(iso, {}).keys())
    for e, imps in series.items():
        if e != iso and iso in imps:
            partner_set.add(e)
    for partner in partner_set:
        ft_data = series.get(iso, {}).get(partner, {})
        tf_data = series.get(partner, {}).get(iso, {})
        years = sorted(set(ft_data) | set(tf_data))
        if not ft_data and not tf_data:
            continue
        slot(partner)["s"] = {
            "y": years,
            "ft": [round(ft_data.get(y) or 0.0, 1) for y in years],
            "tf": [round(tf_data.get(y) or 0.0, 1) for y in years],
        }

    # indirect (2024, both directions)
    for e, i, c, est, prods in conn.execute(
        "SELECT exporter, importer, intermediary, estimate, top_products "
        "FROM indirect_goods WHERE year=? AND (exporter=? OR importer=?) "
        "ORDER BY estimate DESC",
        (INDIRECT_YEAR, iso, iso),
    ):
        try:
            pl = [[code, round(v, 1)] for code, v in json.loads(prods)[:N_INDIRECT_PRODUCTS]]
        except (json.JSONDecodeError, TypeError):
            pl = []
        s = slot(i if e == iso else e)
        key = "i" if e == iso else "ir"
        s.setdefault(key, []).append([c, round(est, 1), pl])
    for p, s in partners.items():
        s["i"] = (s.get("i") or [])[:N_INDIRECT]
        s["ir"] = (s.get("ir") or [])[:N_INDIRECT]

    # TiVA (origin=iso rows only — matches the API's pair perspective)
    tiva: dict[str, dict] = {}
    for y, d, m, v in conn.execute(
        "SELECT year, dest, measure, value FROM tiva "
        "WHERE origin=? ORDER BY year",
        (iso,),
    ):
        tiva.setdefault(d, {}).setdefault(m, {})[y] = v
    for p, measures in tiva.items():
        all_years = sorted(
            {y for vals in measures.values() for y in vals}
        )
        t = {"years": all_years}
        for m, vals in measures.items():
            t[m] = [round(vals.get(y) or 0.0, 1) for y in all_years]
        slot(p)["t"] = t

    return partners


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"missing {DB}; run `make build-db` first")
    conn = sqlite3.connect(DB)
    indexes(conn)

    countries = [
        {"iso3": r[0], "name": r[1], "iso2": r[2]}
        for r in conn.execute(
            "SELECT iso3, name, iso2 FROM countries ORDER BY name"
        )
    ]
    meta = {
        r[0]: r[1] for r in conn.execute("SELECT key, value FROM meta")
    }

    pairs_dir = OUT / "pairs"
    pairs_dir.mkdir(parents=True, exist_ok=True)

    total_bytes = 0
    n = 0
    t0 = time.time()
    for c in countries:
        iso = c["iso3"]
        partners = build_country(conn, iso)
        payload = json.dumps(partners, separators=(",", ":"), ensure_ascii=False)
        blob = gzip.compress(payload.encode("utf-8"), compresslevel=9)
        (pairs_dir / f"{iso}.json.gz").write_bytes(blob)
        total_bytes += len(blob)
        n += 1
        if n % 25 == 0:
            log(f"{n}/{len(countries)} countries, {total_bytes / 1e6:.1f} MB so far")

    countries_doc = {
        "countries": countries,
        "meta": meta,
        "latest_goods_year": INDIRECT_YEAR,
        "indirect_year": INDIRECT_YEAR,
    }
    (OUT / "countries.json").write_text(
        json.dumps(countries_doc, ensure_ascii=False)
    )
    log(
        f"done: {n} country files, {total_bytes / 1e6:.1f} MB total "
        f"({time.time() - t0:.0f}s)"
    )


if __name__ == "__main__":
    main()
