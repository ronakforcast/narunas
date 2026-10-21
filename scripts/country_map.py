"""Country code mapping across data sources.

BACI uses ISO 3166-1 numeric codes (plus special codes for Taiwan and a few
legacy aggregates); BaTIS, TiVA and the frontend use ISO3 alpha codes.
"""
from __future__ import annotations

import csv
from pathlib import Path

# BACI / Comtrade special codes:
#   490 "Other Asia, nes" = Taiwan (has no official ISO numeric in Comtrade)
#   58  "Belgium-Luxembourg (...1998)" — legacy aggregate, no modern flows
#   280 "Fed. Rep. of Germany (...1990)" — legacy (West Germany)
#   697 "Europe EFTA, nes" — residual aggregate
#   711 "Southern African Customs Union (...1999)" — legacy aggregate
#   736 "Sudan (...2011)" — legacy pre-split Sudan
EXCLUDE_CODES = {58, 280, 697, 711, 736}
CODE_TO_ISO3_FIX = {490: "TWN"}  # "Other Asia, nes" -> Taiwan
DISPLAY_NAME_FIX = {"TWN": "Taiwan"}


def _repair_mojibake(name: str) -> str:
    """CEPII's metadata files sometimes contain double-encoded UTF-8
    (e.g. 'T\u00c3\u00bcrkiye' for 'T\u00fcrkiye'). Repair when the
    latin-1 -> utf-8 round trip succeeds."""
    try:
        repaired = name.encode("latin-1").decode("utf-8")
        return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        return name


def load_baci_countries(extracted_dir: Path) -> list[dict]:
    """Load BACI country codes, applying fixes. Returns list of dicts:
    {code: int, name: str, iso2: str|None, iso3: str}
    """
    path = Path(extracted_dir) / "country_codes_V202601.csv"
    out = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            code = int(row["country_code"])
            if code in EXCLUDE_CODES:
                continue
            iso3 = CODE_TO_ISO3_FIX.get(code) or row["country_iso3"].strip()
            if not iso3:  # safety: skip anything without an ISO3
                continue
            name = DISPLAY_NAME_FIX.get(iso3) or _repair_mojibake(
                row["country_name"].strip()
            )
            out.append(
                {
                    "code": code,
                    "name": name,
                    "iso2": (row.get("country_iso2") or "").strip() or None,
                    "iso3": iso3,
                }
            )
    # injectivity check
    iso3s = [c["iso3"] for c in out]
    assert len(iso3s) == len(set(iso3s)), "duplicate ISO3 after country fixes"
    return out


def load_products(extracted_dir: Path) -> list[dict]:
    """Load HS6 product codes. Returns [{code, description}]."""
    path = Path(extracted_dir) / "product_codes_HS12_V202601.csv"
    out = []
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            out.append({"code": row["code"].strip(), "description": row["description"]})
    return out
