#!/usr/bin/env python3
"""Fetch all raw data sources into data/raw/.

Sources (all free):
  - CEPII BACI HS12 V202601 (goods, bilateral, HS6, 2012-2024) ~1.3 GB
  - WTO-OECD BaTIS BPM6 (services, bilateral, 2005-2024) ~140 MB
  - OECD TiVA 2025 principal indicators via SDMX (value-added flows)

All downloads are cached: re-running skips files already present.
"""
from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent / "data" / "raw"

BACI_URL = (
    "https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS12_V202601.zip"
)
BATIS_DATA_URL = (
    "https://www.wto.org/english/res_e/statis_e/daily_update_e/"
    "OECD-WTO_BATIS_data_BPM6-1.zip"
)
BATIS_CODES_URL = (
    "https://www.wto.org/english/res_e/statis_e/daily_update_e/"
    "OECD-WTO_BATIS_codes_BPM6-1.zip"
)

# TiVA: MEASURE.REF_AREA.ACTIVITY.COUNTERPART_AREA.UNIT_MEASURE.FREQ
# Measures:
#   FFD_DVA   domestic value added (origin) embodied in counterpart final demand
#   FEXGR_DVA domestic value added (origin) embodied in counterpart gross exports
#   DFD_FVA   foreign value added (counterpart origin) embodied in domestic final demand
TIVA_URL = (
    "https://sdmx.oecd.org/sti-public/rest/data/"
    "OECD.STI.PIE,DSD_TIVA_MAINLV@DF_MAINLV,1.1/"
    "FFD_DVA+FEXGR_DVA+DFD_FVA.._T..USD.A"
    "?startPeriod=1995&format=csvfilewithlabels"
)

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def download(url: str, dest: Path, label: str) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[fetch] {label}: already cached ({dest.stat().st_size:,} B), skipping")
        return
    print(f"[fetch] {label}: {url}")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as f:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
    tmp.rename(dest)
    print(f"[fetch] {label}: done ({dest.stat().st_size:,} B)")


def main(only: str | None = None) -> None:
    tasks = {
        "baci": lambda: download(BACI_URL, RAW / "BACI_HS12_V202601.zip", "BACI HS12 V202601"),
        "batis": lambda: [
            download(BATIS_DATA_URL, RAW / "batis_data_BPM6.zip", "BaTIS data BPM6"),
            download(BATIS_CODES_URL, RAW / "batis_codes_BPM6.zip", "BaTIS codes BPM6"),
        ],
        "tiva": lambda: download(TIVA_URL, RAW / "tiva_main.csv", "TiVA principal indicators"),
    }
    for name, fn in tasks.items():
        if only is None or only == name:
            fn()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
