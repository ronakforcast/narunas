#!/usr/bin/env python3
"""Generate web/src/assets/hs4-names.json — readable names for the HS4
headings that appear in the exported indirect top_products.

Name rule: take the highest-value HS6 child of the heading in 2024 flows,
keep the text before the first ':' or '(' — the heading-level concept.
"""
import gzip
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "trade.db"
PAIRS = ROOT / "web" / "public" / "data" / "pairs"
OUT = ROOT / "web" / "src" / "assets" / "hs4-names.json"

# 1. collect the hs4 codes that actually ship in indirect top_products
codes = set()
for f in PAIRS.glob("*.json.gz"):
    try:
        d = json.load(gzip.open(f))
    except OSError:
        continue
    for partner, slots in d.items():
        for key in ("i", "ir"):
            for _iso, _est, prods in slots.get(key) or []:
                for hs4, _v in prods or []:
                    codes.add(str(hs4))
print(f"hs4 codes in shipped data: {len(codes)}")

# 2. best child by 2024 trade value per heading — one pass
conn = sqlite3.connect(DB)
best: dict[str, tuple[float, str]] = {}
for h6, desc, v in conn.execute(
    "SELECT f.hs6, p.description, SUM(f.value) "
    "FROM flows_goods_hs6 f LEFT JOIN products p ON p.hs6 = f.hs6 "
    "WHERE f.year = 2024 AND p.description IS NOT NULL "
    "GROUP BY f.hs6, p.description",
):
    h4 = h6[:4]
    if v is not None and (h4 not in best or v > best[h4][0]):
        best[h4] = (v, desc)
print(f"hs6 rows grouped: {len(best)}")

names = {}
for hs4 in sorted(codes):
    if hs4 not in best:
        continue
    desc = best[hs4][1]
    for sep in (":", "("):
        idx = desc.find(sep)
        if idx > 3:
            desc = desc[:idx]
            break
    desc = desc.strip().rstrip(",").strip()
    if desc:
        names[hs4] = desc[:60]

print(f"names derived: {len(names)}")
missing = sorted(codes - set(names))
if missing:
    print("no name for:", missing[:20])

OUT.write_text(json.dumps(names, ensure_ascii=False, indent=0))
print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.1f} KB)")
