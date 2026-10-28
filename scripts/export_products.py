#!/usr/bin/env python3
"""Export per-product global files for product-first exploration.

Writes web/public/data/products/:
  {hs4}.json.gz  — one file per HS4 heading present in 2024 trade
  {ch2}.json.gz  — one file per 2-digit chapter (heading-level rollup)

File shape (heading level; chapters aggregate their headings):
  {
    "code": "3004", "kind": "hs4"|"chapter",
    "w":  [world_2024, world_2023],
    "im": [[iso3, v24, v23, qty24, [[src, v24], ...top3]], ...top20],
    "ex": [[iso3, v24, v23], ...top20],
    "c":  [[hs6, v24, [[iso3, v24], ...top5]], ...top10]   # hs4 only
  }

Why HS4 granularity: sellers target product categories ("medicaments"),
and HS6 children ride along for drill-down. Importers carry their top
direct supplier countries, so a seller sees the current competition per
market. Indirect (rerouted) trade is a per-pair estimate — it lives in
the pair analysis, not here, to avoid double counting across routes.

Usage: python3 scripts/export_products.py
"""
from __future__ import annotations

import gzip
import json
import sqlite3
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "trade.db"
OUT = ROOT / "web" / "public" / "data" / "products"

YEAR = 2024
PREV = 2023
N_IMPORTERS = 20
N_EXPORTERS = 20
N_SUPPLIERS = 3
N_CHILDREN = 10
N_CHILD_IMPORTERS = 5


def log(msg: str) -> None:
    print(f"[export_products {time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main() -> None:
    conn = sqlite3.connect(DB)
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- pass 1: importer and exporter totals per heading, both years ----
    im: dict[str, dict[str, list[float]]] = {}   # h4 -> imp -> [v24, v23, q24]
    ex: dict[str, dict[str, list[float]]] = {}   # h4 -> exp -> [v24, v23]
    child: dict[str, dict[str, float]] = {}      # h4 -> hs6 -> world v24

    for year in (YEAR, PREV):
        for h, imp, v in conn.execute(
            "SELECT substr(hs6,1,4), importer, SUM(value) "
            "FROM flows_goods_hs6 WHERE year=? GROUP BY substr(hs6,1,4), importer",
            (year,),
        ):
            d = im.setdefault(h, {}).setdefault(imp, [0.0, 0.0, 0.0])
            d[0 if year == YEAR else 1] = v or 0.0
        for h, exp_, v in conn.execute(
            "SELECT substr(hs6,1,4), exporter, SUM(value) "
            "FROM flows_goods_hs6 WHERE year=? GROUP BY substr(hs6,1,4), exporter",
            (year,),
        ):
            d = ex.setdefault(h, {}).setdefault(exp_, [0.0, 0.0])
            d[0 if year == YEAR else 1] = v or 0.0
    for h, imp, q in conn.execute(
        "SELECT substr(hs6,1,4), importer, SUM(qty) "
        "FROM flows_goods_hs6 WHERE year=? GROUP BY substr(hs6,1,4), importer",
        (YEAR,),
    ):
        im[h][imp][2] = q or 0.0
    for h, hs6, v in conn.execute(
        "SELECT substr(hs6,1,4), hs6, SUM(value) "
        "FROM flows_goods_hs6 WHERE year=? GROUP BY substr(hs6,1,4), hs6",
        (YEAR,),
    ):
        child.setdefault(h, {})[hs6] = v or 0.0

    world = {
        h: sum(d[0] for d in imps.values()) for h, imps in im.items()
    }
    prev_world = {
        h: sum(d[1] for d in imps.values()) for h, imps in im.items()
    }
    log(f"headings: {len(im)}, world 2024: ${sum(world.values()) / 1e6:.2f}T")

    # ---- pass 2: top direct suppliers for the top importers only ----
    top_importers: dict[str, list[tuple[float, str]]] = {}
    for h, imps in im.items():
        ranked = sorted(
            ((d[0], iso) for iso, d in imps.items()), reverse=True
        )[:N_IMPORTERS]
        top_importers[h] = ranked
    combos = {(h, iso) for h, ranked in top_importers.items() for _, iso in ranked}
    suppliers: dict[tuple[str, str], list[list[float]]] = {}
    # [ [v, src] * N_SUPPLIERS ] kept sorted desc; small fixed size
    for hs6, imp, exp_, v in conn.execute(
        "SELECT hs6, importer, exporter, value FROM flows_goods_hs6 "
        f"WHERE year={YEAR}"
    ):
        key = (hs6[:4], imp)
        if key not in combos:
            continue
        lst = suppliers.setdefault(key, [])
        entry = [v or 0.0, exp_]
        if len(lst) < N_SUPPLIERS:
            lst.append(entry)
            lst.sort(reverse=True)
        elif entry > lst[-1]:
            lst[-1] = entry
            lst.sort(reverse=True)
    log(f"supplier pass done: {len(suppliers)} heading-market combos")

    # children importers (top-5 per child, heading file only)
    child_im: dict[tuple[str, str], list[list[float]]] = {}
    top_children: dict[str, list[tuple[float, str]]] = {
        h: sorted(((v, c) for c, v in ch.items()), reverse=True)[:N_CHILDREN]
        for h, ch in child.items()
    }
    child_combos = {
        (h, c) for h, ranked in top_children.items() for _, c in ranked
    }
    for hs6, imp, v in conn.execute(
        "SELECT hs6, importer, SUM(value) FROM flows_goods_hs6 "
        f"WHERE year={YEAR} GROUP BY hs6, importer"
    ):
        key = (hs6[:4], hs6)
        if key not in child_combos:
            continue
        lst = child_im.setdefault(key, [])
        entry = [v or 0.0, imp]
        if len(lst) < N_CHILD_IMPORTERS:
            lst.append(entry)
            lst.sort(reverse=True)
        elif entry > lst[-1]:
            lst[-1] = entry
            lst.sort(reverse=True)
    log("child importer pass done")

    def build(h: str, kind: str) -> dict:
        imps = im.get(h, {})
        w = world.get(h, 0.0)
        im_list = []
        for v24, iso in top_importers.get(h, []):
            d = imps[iso]
            sup = [[s, round(v, 1)] for v, s in suppliers.get((h, iso), [])]
            share = round(v24 / w * 100, 1) if w > 0 else 0.0
            im_list.append(
                [iso, round(v24, 1), round(d[1], 1), round(d[2], 1),
                 share, sup]
            )
        ex_list = [
            [iso, round(d[0], 1), round(d[1], 1)]
            for iso, d in sorted(
                ex.get(h, {}).items(), key=lambda kv: kv[1][0], reverse=True
            )[:N_EXPORTERS]
        ]
        doc = {
            "code": h,
            "kind": kind,
            "w": [round(w, 1), round(prev_world.get(h, 0.0), 1)],
            "im": im_list,
            "ex": ex_list,
        }
        if kind == "hs4":
            doc["c"] = [
                [c, round(v, 1),
                 [[iso, round(iv, 1)] for iv, iso in child_im.get((h, c), [])]]
                for v, c in top_children.get(h, [])
            ]
        return doc

    total_bytes = 0
    n = 0
    t0 = time.time()
    for h in sorted(im):
        doc = build(h, "hs4")
        blob = gzip.compress(
            json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode(),
            9,
        )
        (OUT / f"{h}.json.gz").write_bytes(blob)
        total_bytes += len(blob)
        n += 1
    log(f"wrote {n} heading files, {total_bytes / 1e6:.2f} MB")

    # ---- chapters: roll up their headings' importer/exporter maps ----
    ch_im: dict[str, dict[str, list[float]]] = {}
    ch_ex: dict[str, dict[str, list[float]]] = {}
    for h, imps in im.items():
        c2 = h[:2]
        for iso, d in imps.items():
            e = ch_im.setdefault(c2, {}).setdefault(iso, [0.0, 0.0, 0.0])
            e[0] += d[0]
            e[1] += d[1]
            e[2] += d[2]
    for h, exps in ex.items():
        c2 = h[:2]
        for iso, d in exps.items():
            e = ch_ex.setdefault(c2, {}).setdefault(iso, [0.0, 0.0])
            e[0] += d[0]
            e[1] += d[1]

    # chapter suppliers: reuse heading suppliers where the heading is the
    # chapter's biggest (approximation is not acceptable) — instead rerun
    # a compact pass for chapter-level combos
    top_ch_importers = {
        c2: sorted(((d[0], iso) for iso, d in imps.items()), reverse=True)[:N_IMPORTERS]
        for c2, imps in ch_im.items()
    }
    ch_combos = {
        (c2, iso) for c2, ranked in top_ch_importers.items() for _, iso in ranked
    }
    ch_suppliers: dict[tuple[str, str], list[list[float]]] = {}
    for hs6, imp, exp_, v in conn.execute(
        "SELECT hs6, importer, exporter, value FROM flows_goods_hs6 "
        f"WHERE year={YEAR}"
    ):
        key = (hs6[:2], imp)
        if key not in ch_combos:
            continue
        lst = ch_suppliers.setdefault(key, [])
        entry = [v or 0.0, exp_]
        if len(lst) < N_SUPPLIERS:
            lst.append(entry)
            lst.sort(reverse=True)
        elif entry > lst[-1]:
            lst[-1] = entry
            lst.sort(reverse=True)

    # chapter children: top headings with their top importers
    ch_child: dict[str, list[tuple[float, str]]] = {}
    for h, w in world.items():
        ch_child.setdefault(h[:2], []).append((w, h))
    ch_child = {
        c2: sorted(ranked, reverse=True)[:N_CHILDREN]
        for c2, ranked in ch_child.items()
    }
    ch_child_im: dict[tuple[str, str], list[list[float]]] = {}
    ch_child_combos = {
        (c2, h) for c2, ranked in ch_child.items() for _, h in ranked
    }
    for h, imps in im.items():
        c2 = h[:2]
        if (c2, h) not in ch_child_combos:
            continue
        lst = ch_child_im.setdefault((c2, h), [])
        for iso, d in sorted(imps.items(), key=lambda kv: kv[1][0], reverse=True)[:N_CHILD_IMPORTERS]:
            lst.append([d[0], iso])
        lst.sort(reverse=True)

    def build_ch(c2: str) -> dict:
        imps = ch_im[c2]
        w = sum(d[0] for d in imps.values())
        pw = sum(d[1] for d in imps.values())
        im_list = []
        for v24, iso in top_ch_importers[c2]:
            d = imps[iso]
            sup = [[s, round(v, 1)] for v, s in ch_suppliers.get((c2, iso), [])]
            share = round(v24 / w * 100, 1) if w > 0 else 0.0
            im_list.append(
                [iso, round(v24, 1), round(d[1], 1), round(d[2], 1),
                 share, sup]
            )
        ex_list = [
            [iso, round(d[0], 1), round(d[1], 1)]
            for iso, d in sorted(
                ch_ex[c2].items(), key=lambda kv: kv[1][0], reverse=True
            )[:N_EXPORTERS]
        ]
        return {
            "code": c2,
            "kind": "chapter",
            "w": [round(w, 1), round(pw, 1)],
            "im": im_list,
            "ex": ex_list,
            "c": [
                [h, round(v, 1),
                 [[iso, round(iv, 1)] for iv, iso in ch_child_im.get((c2, h), [])]]
                for v, h in ch_child[c2]
            ],
        }

    for c2 in sorted(ch_im):
        doc = build_ch(c2)
        blob = gzip.compress(
            json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode(),
            9,
        )
        (OUT / f"{c2}.json.gz").write_bytes(blob)
        total_bytes += len(blob)
        n += 1
    log(
        f"done: {n} product files ({len(ch_im)} chapters), "
        f"{total_bytes / 1e6:.2f} MB total ({time.time() - t0:.0f}s)"
    )
    conn.close()


if __name__ == "__main__":
    main()
