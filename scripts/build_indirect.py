#!/usr/bin/env python3
"""Precompute the indirect-trade table.

For every ordered country pair (A, B) and every candidate intermediary C,
estimates the goods that plausibly flow A -> C -> B as:

    estimate(A, B, C) = sum over product headings k of
                        min( export(A -> C, k), export(C -> B, k) )

The estimate uses HS4 (4-digit heading) aggregation for speed: for each
heading, the smaller of the two legs bounds what can be routed onward.
This is the shared-product transshipment indicator used in the sanctions
re-routing literature (e.g. the EBRD/CEPR "Eurasian Roundabout" analyses,
which compare exports into an intermediary with onward exports from it on
the same HS products). It is an UPPER-BOUND estimate: the intermediary may
legitimately consume those goods itself.

Stores the top-10 intermediaries per ordered (A, B) per year for the latest
3 BACI years, each with its top shared product headings for drill-down.

Usage: python3 scripts/build_indirect.py
"""
from __future__ import annotations

import json
import sqlite3
import sys
import time
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DB = ROOT / "data" / "trade.db"
BACI_ZIP = RAW / "BACI_HS12_V202601.zip"

INDIRECT_YEARS = [2022, 2023, 2024]
TOP_K = 10  # intermediaries kept per ordered pair
TOP_PRODUCTS = 5  # shared headings kept per (pair, intermediary)
MIN_C_TOTAL = 1.0  # skip C with <$1M total on either leg (USD millions)
PRODUCT_LEVEL = 4  # HS4 for estimation speed

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS indirect_goods (
    year INTEGER, exporter TEXT, importer TEXT, intermediary TEXT,
    estimate REAL, top_products TEXT,
    PRIMARY KEY (year, exporter, importer, intermediary)) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_ig_pair ON indirect_goods (exporter, importer);
"""


def log(msg: str) -> None:
    print(f"[indirect {time.strftime('%H:%M:%S')}] {msg}", flush=True)


class YearFlows:
    """One BACI year in dense index arrays with fast pair lookups.

    Rows are kept in three orderings so that "all rows with exporter == a",
    "all rows with importer == j" and "all rows with pair (a, j)" are each a
    contiguous slice (via searchsorted on the sorted key).
    """

    def __init__(self, z: zipfile.ZipFile, year: int, code_to_idx: dict):
        name = next(n for n in z.namelist() if f"Y{year}_V202601.csv" in n)
        df = pd.read_csv(z.open(name), usecols=["i", "j", "k", "v"],
                         dtype={"k": str})
        valid = set(code_to_idx)
        df = df[df["i"].isin(valid) & df["j"].isin(valid)]
        df["k4"] = df["k"].str.zfill(6).str[:PRODUCT_LEVEL]

        self.products = sorted(df["k4"].unique())
        prod_to_idx = {p: i for i, p in enumerate(self.products)}
        self.n_products = len(self.products)
        self.n = len(code_to_idx)

        self.ei = df["i"].map(code_to_idx).to_numpy(np.int32)
        self.ej = df["j"].map(code_to_idx).to_numpy(np.int32)
        self.ek = df["k4"].map(prod_to_idx).to_numpy(np.int32)
        self.ev = (df["v"].to_numpy(np.float64) / 1000.0).astype(np.float32)
        self.n_rows = len(self.ei)

        # ordering by importer j, then exporter i (for V: exports INTO j)
        self._order_ij = np.lexsort((self.ei, self.ej))
        # ordering by exporter i, then importer j (for W: exports FROM i)
        self._order_ji = np.lexsort((self.ej, self.ei))
        # precomputed sorted keys: ej*4096+ei under order_ij, ei*4096+ej under order_ji
        self._key_ij = (
            self.ej.astype(np.int64) * 4096 + self.ei
        )[self._order_ij]
        self._key_ji = (
            self.ei.astype(np.int64) * 4096 + self.ej
        )[self._order_ji]

    def _slice(self, order: np.ndarray, sorted_key: np.ndarray,
               lo: int, hi: int) -> np.ndarray:
        """Positions (into the original arrays) of rows with key in [lo, hi)."""
        return order[
            np.searchsorted(sorted_key, lo, "left"):
            np.searchsorted(sorted_key, hi, "left")
        ]

    def leg_matrix_into(self, c: int) -> np.ndarray:
        """(N, P) exports from every a into c."""
        rows = self._slice(self._order_ij, self._key_ij, c * 4096, (c + 1) * 4096)
        V = np.zeros((self.n, self.n_products), np.float32)
        np.add.at(V, (self.ei[rows], self.ek[rows]), self.ev[rows])
        return V

    def leg_matrix_out(self, c: int) -> np.ndarray:
        """(P, N) exports from c into every b."""
        rows = self._slice(self._order_ji, self._key_ji, c * 4096, (c + 1) * 4096)
        W = np.zeros((self.n_products, self.n), np.float32)
        np.add.at(W, (self.ek[rows], self.ej[rows]), self.ev[rows])
        return W

    def pair_vector(self, a: int, j: int) -> np.ndarray:
        """(P,) exports from a into j (densified product vector)."""
        lo = j * 4096 + a
        rows = self._slice(self._order_ij, self._key_ij, lo, lo + 1)
        v = np.zeros(self.n_products, np.float32)
        np.add.at(v, self.ek[rows], self.ev[rows])
        return v


def estimate_matrix(V: np.ndarray, W: np.ndarray, chunk: int = 512) -> np.ndarray:
    """est[A, B] = sum_k min(V[A, k], W[k, B]), chunked over products."""
    n = V.shape[0]
    m = W.shape[1]
    est = np.zeros((n, m), np.float64)
    for k0 in range(0, V.shape[1], chunk):
        k1 = min(k0 + chunk, V.shape[1])
        # (A, 1, chunk) vs (1, B, chunk) -> min -> (A, B, chunk) -> sum over k
        est += np.minimum(
            V[:, None, k0:k1], W[k0:k1].T[None, :, :]
        ).sum(axis=2, dtype=np.float64)
    return est


def process_year(
    conn: sqlite3.Connection, flows: YearFlows, iso3s: list[str], year: int
) -> None:
    n, p = flows.n, flows.n_products
    best_val = np.zeros((n, n, TOP_K), np.float64)
    best_c = np.full((n, n, TOP_K), -1, np.int16)

    for c in range(n):
        V = flows.leg_matrix_into(c)
        if V.sum() < MIN_C_TOTAL:
            continue
        W = flows.leg_matrix_out(c)
        if W.sum() < MIN_C_TOTAL:
            continue
        est = estimate_matrix(V, W)
        est[c, :] = 0.0
        est[:, c] = 0.0
        np.fill_diagonal(est, 0.0)
        floor = best_val[:, :, TOP_K - 1]
        ai, bi = np.nonzero(est > floor)
        for a, b in zip(ai, bi):
            cand = est[a, b]
            slot = np.searchsorted(-best_val[a, b], -cand)
            if slot >= TOP_K:
                continue
            best_val[a, b] = np.insert(best_val[a, b], slot, cand)[:TOP_K]
            best_c[a, b] = np.insert(best_c[a, b], slot, c)[:TOP_K]

    rows = []
    for a in range(n):
        for b in range(n):
            if b == a:
                continue
            for k in range(TOP_K):
                c_idx = int(best_c[a, b, k])
                val = float(best_val[a, b, k])
                if c_idx < 0 or val <= 0:
                    continue
                into = flows.pair_vector(a, c_idx)
                out = flows.pair_vector(c_idx, b)
                shared = np.minimum(into, out)
                top = np.argsort(shared)[::-1][:TOP_PRODUCTS]
                prods = json.dumps(
                    [(flows.products[i], round(float(shared[i]), 3))
                     for i in top if shared[i] > 0]
                )
                rows.append(
                    (year, iso3s[a], iso3s[b], iso3s[c_idx], val, prods)
                )
    conn.executemany(
        "INSERT OR REPLACE INTO indirect_goods VALUES (?,?,?,?,?,?)", rows
    )
    conn.commit()
    log(f"{year}: stored {len(rows):,} intermediary rows")


def main() -> None:
    conn = sqlite3.connect(DB)
    conn.executescript(CREATE_TABLE)
    conn.execute("DELETE FROM indirect_goods")
    countries = conn.execute("SELECT code, iso3 FROM countries").fetchall()
    code_to_idx = {code: idx for idx, (code, _) in enumerate(countries)}
    iso3s = [iso for _, iso in countries]
    log(f"{len(countries)} countries")

    with zipfile.ZipFile(BACI_ZIP) as z:
        for year in INDIRECT_YEARS:
            t0 = time.time()
            flows = YearFlows(z, year, code_to_idx)
            log(f"{year}: {flows.n_rows:,} flows, {flows.n_products} HS4 headings")
            process_year(conn, flows, iso3s, year)
            log(f"{year}: done ({time.time() - t0:.0f}s)")

    conn.close()
    log("done")


if __name__ == "__main__":
    main()
