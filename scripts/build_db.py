#!/usr/bin/env python3
"""Build data/trade.db from the raw sources.

- countries, products: from BACI metadata
- direct_goods: (year, exporter, importer) totals from BACI, USD millions
- flows_goods_hs6: HS6 detail for the latest BACI year, USD millions
- direct_services: balanced bilateral services totals from BaTIS, USD millions
- tiva: OECD TiVA value-added indicators (FFD_DVA / FEXGR_DVA / DFD_FVA)

Usage:
  python3 scripts/build_db.py [--skip-batis]
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time
import zipfile
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from country_map import load_baci_countries, load_products  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EXTRACTED = ROOT / "data" / "extracted"
DB = ROOT / "data" / "trade.db"

BACI_ZIP = RAW / "BACI_HS12_V202601.zip"
TIVA_CSV = RAW / "tiva_main.csv"
BATIS_ZIP = RAW / "batis_data_BPM6.zip"

HS6_KEEP_YEARS = {2023, 2024}  # persist HS6 detail for growth (YoY) + pricing
BACI_K_TO_M = 1000.0  # BACI values are thousand USD -> store USD millions

SCHEMA = """
CREATE TABLE IF NOT EXISTS countries (
    iso3 TEXT PRIMARY KEY, code INTEGER UNIQUE, name TEXT, iso2 TEXT);
CREATE TABLE IF NOT EXISTS products (
    hs6 TEXT PRIMARY KEY, description TEXT);
CREATE TABLE IF NOT EXISTS direct_goods (
    year INTEGER, exporter TEXT, importer TEXT, value REAL,
    PRIMARY KEY (year, exporter, importer)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_dg_pair ON direct_goods (exporter, importer);
CREATE TABLE IF NOT EXISTS flows_goods_hs6 (
    year INTEGER, exporter TEXT, importer TEXT, hs6 TEXT, value REAL,
    qty REAL);
CREATE INDEX IF NOT EXISTS idx_hs6_pair ON flows_goods_hs6 (exporter, importer);
CREATE TABLE IF NOT EXISTS direct_services (
    year INTEGER, exporter TEXT, importer TEXT, value REAL,
    PRIMARY KEY (year, exporter, importer)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS tiva (
    year INTEGER, origin TEXT, dest TEXT, measure TEXT, value REAL,
    PRIMARY KEY (year, origin, dest, measure)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
"""


def log(msg: str) -> None:
    print(f"[build_db {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def ingest_baci(conn: sqlite3.Connection) -> None:
    countries = load_baci_countries(EXTRACTED)
    code_to_iso3 = {c["code"]: c["iso3"] for c in countries}
    conn.executemany(
        "INSERT OR REPLACE INTO countries VALUES (?,?,?,?)",
        [(c["iso3"], c["code"], c["name"], c["iso2"]) for c in countries],
    )
    products = load_products(EXTRACTED)
    conn.executemany(
        "INSERT OR REPLACE INTO products VALUES (?,?)",
        [(p["code"], p["description"]) for p in products],
    )
    conn.commit()
    log(f"countries={len(countries)} products={len(products)}")

    valid_codes = set(code_to_iso3)
    with zipfile.ZipFile(BACI_ZIP) as z:
        year_names = sorted(
            n for n in z.namelist() if n.endswith(".csv") and "_Y" in n
        )
        for name in year_names:
            year = int(name.split("_Y")[1].split("_")[0])
            t0 = time.time()
            totals: dict[tuple[int, int], float] = {}
            hs6_batch: list[tuple] = []
            reader = pd.read_csv(
                z.open(name),
                chunksize=2_000_000,
                usecols=["t", "i", "j", "k", "v", "q"],
                dtype={"k": str},
            )
            for chunk in reader:
                chunk = chunk[
                    chunk["i"].isin(valid_codes) & chunk["j"].isin(valid_codes)
                ]
                if chunk.empty:
                    continue
                g = chunk.groupby(["i", "j"], sort=False)["v"].sum()
                for (i, j), v in g.items():
                    totals[(i, j)] = totals.get((i, j), 0.0) + float(v)
                if year in HS6_KEEP_YEARS:
                    # q: quantity in metric tons (0/NaN when not reported)
                    hs6_batch.extend(
                        (
                            year,
                            code_to_iso3[i],
                            code_to_iso3[j],
                            k,
                            float(v) / BACI_K_TO_M,
                            0.0 if pd.isna(qq) else round(float(qq), 3),
                        )
                        for i, j, k, v, qq in zip(
                            chunk["i"], chunk["j"], chunk["k"],
                            chunk["v"], chunk["q"],
                        )
                    )
            rows = [
                (year, code_to_iso3[i], code_to_iso3[j], v / BACI_K_TO_M)
                for (i, j), v in totals.items()
            ]
            conn.executemany(
                "INSERT OR REPLACE INTO direct_goods VALUES (?,?,?,?)", rows
            )
            if hs6_batch:
                log(f"  inserting {len(hs6_batch):,} HS6 rows for {year} ...")
                conn.executemany(
                    "INSERT OR REPLACE INTO flows_goods_hs6 "
                    "VALUES (?,?,?,?,?,?)", hs6_batch
                )
            conn.commit()
            log(
                f"BACI {year}: {len(rows):,} pair totals "
                f"({time.time() - t0:.0f}s)"
            )


def ingest_tiva(conn: sqlite3.Connection) -> None:
    valid = {
        r[0] for r in conn.execute("SELECT iso3 FROM countries").fetchall()
    }
    df = pd.read_csv(
        TIVA_CSV,
        usecols=[
            "MEASURE",
            "REF_AREA",
            "COUNTERPART_AREA",
            "TIME_PERIOD",
            "OBS_VALUE",
        ],
        dtype={"REF_AREA": str, "COUNTERPART_AREA": str},
    )
    df = df[
        df["REF_AREA"].isin(valid) & df["COUNTERPART_AREA"].isin(valid)
    ]
    rows = [
        (int(t), o, d, m, float(v))
        for m, o, d, t, v in zip(
            df["MEASURE"],
            df["REF_AREA"],
            df["COUNTERPART_AREA"],
            df["TIME_PERIOD"],
            df["OBS_VALUE"],
        )
        if pd.notna(v)
    ]
    conn.executemany("INSERT OR REPLACE INTO tiva VALUES (?,?,?,?,?)", rows)
    conn.commit()
    log(f"TiVA: {len(rows):,} rows "
        f"({df['TIME_PERIOD'].min()}-{df['TIME_PERIOD'].max()})")


def ingest_batis(conn: sqlite3.Connection) -> None:
    """Parse the WTO-OECD BaTIS BPM6 bulk CSV into direct_services.

    Column layout (verified against the December 2025 bulk file):
      Reporter, type_Reporter, Partner, type_Partner, Flow, Item_code,
      type_Item, Year, Reported_value, Final_value, Final_value_methodology,
      Balanced_value
    We keep the BALANCED values for total services (Item_code == 'S'),
    exports direction (Flow == 'X', i.e. Reporter exports to Partner),
    country-to-country rows only (type 'c'). Values are million USD.
    """
    iso2_to_iso3 = {
        r[0]: r[1] for r in conn.execute("SELECT iso2, iso3 FROM countries")
    }
    with zipfile.ZipFile(BATIS_ZIP) as z:
        data_name = next(
            n for n in z.namelist() if n.lower().endswith(".csv")
        )
        log(f"BaTIS: streaming {data_name} (2.98 GB) ...")
        reader = pd.read_csv(z.open(data_name), chunksize=2_000_000)
        n_rows = 0
        for chunk in reader:
            rows = parse_batis_chunk(chunk, iso2_to_iso3)
            if rows:
                conn.executemany(
                    "INSERT OR REPLACE INTO direct_services VALUES (?,?,?,?)",
                    rows,
                )
                n_rows += len(rows)
        conn.commit()
    log(f"BaTIS: {n_rows:,} total-services rows")


def parse_batis_chunk(
    chunk: pd.DataFrame, iso2_to_iso3: dict[str, str]
) -> list[tuple]:
    """Extract (year, exporter, importer, value_musd) rows from a BaTIS chunk.

    Kept as a separate function so tests can exercise the parsing rules.
    """
    sel = chunk[
        (chunk["type_Reporter"] == "c")
        & (chunk["type_Partner"] == "c")
        & (chunk["Flow"] == "X")
        & (chunk["Item_code"] == "S")
        & chunk["Balanced_value"].notna()
    ]
    out = []
    for r, p, y, v in zip(
        sel["Reporter"], sel["Partner"], sel["Year"], sel["Balanced_value"]
    ):
        er = iso2_to_iso3.get(str(r))
        ir = iso2_to_iso3.get(str(p))
        if er and ir:
            out.append((int(y), er, ir, float(v)))
    return out


def write_meta(conn: sqlite3.Connection) -> None:
    meta = {
        "baci_version": "V202601 (data through 2024)",
        "batis_version": "BPM6 (2025-12 update, data through 2024)",
        "tiva_version": "2025 edition (data through 2022)",
        "built_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    conn.executemany(
        "INSERT OR REPLACE INTO meta VALUES (?,?)", list(meta.items())
    )
    conn.commit()
    # numeric-id -> iso3 map for the frontend (world-atlas topojson ids).
    # world-atlas (Natural Earth) uses ISO 3166-1 numeric ids, zero-padded
    # ("032" Argentina), while BACI uses Comtrade numeric codes which are
    # un-padded and differ for a few countries (Comtrade quirk). Emit keys
    # in both forms plus explicit ISO-numeric overrides for the deviations.
    ISO_NUMERIC_OVERRIDES = {
        "840": "USA",  # BACI/Comtrade 842
        "250": "FRA",  # BACI/Comtrade 251
        "578": "NOR",  # BACI/Comtrade 579
        "356": "IND",  # BACI/Comtrade 699
        "756": "CHE",  # BACI/Comtrade 757
        "158": "TWN",  # BACI/Comtrade 490 ("Other Asia, nes")
    }
    rows = conn.execute("SELECT code, iso3 FROM countries").fetchall()
    out: dict[str, str] = {}
    for code, iso3 in rows:
        out[str(code)] = iso3
        out[str(code).zfill(3)] = iso3
    for iso_num, iso3 in ISO_NUMERIC_OVERRIDES.items():
        out[iso_num] = iso3
        out[iso_num.zfill(3)] = iso3
    (ROOT / "data" / "country_ids.json").write_text(json.dumps(out))
    # keep a copy inside the web assets so the frontend build picks it up
    web_assets = ROOT / "web" / "src" / "assets"
    web_assets.mkdir(parents=True, exist_ok=True)
    (web_assets / "country-ids.json").write_text(json.dumps(out))


def sanity_report(conn: sqlite3.Connection) -> None:
    q = lambda sql: conn.execute(sql).fetchone()[0]  # noqa: E731
    world_2024 = q("SELECT SUM(value) FROM direct_goods WHERE year=2024")
    log(f"SANITY world goods trade 2024: ${world_2024 / 1e6:.2f}T "
        f"(expect roughly 24-26T)")
    for flow in [("LTU", "RUS"), ("RUS", "LTU"), ("DEU", "USA")]:
        v = conn.execute(
            "SELECT value FROM direct_goods WHERE year=2024 AND exporter=? "
            "AND importer=?",
            flow,
        ).fetchone()
        log(f"SANITY {'->'.join(flow)} 2024: "
            f"${(v[0] if v else 0):,.0f}M")


def main() -> None:
    skip_batis = "--skip-batis" in sys.argv
    if not BACI_ZIP.exists():
        sys.exit(f"missing {BACI_ZIP}; run scripts/fetch_data.py first")
    DB.parent.mkdir(parents=True, exist_ok=True)
    if DB.exists():
        DB.unlink()
    conn = sqlite3.connect(DB)
    conn.executescript(SCHEMA)
    log(f"creating {DB}")
    ingest_baci(conn)
    ingest_tiva(conn)
    if not skip_batis and BATIS_ZIP.exists():
        ingest_batis(conn)
    else:
        log("skipping BaTIS (not downloaded or --skip-batis)")
    write_meta(conn)
    sanity_report(conn)
    conn.close()
    log("done")


if __name__ == "__main__":
    main()
