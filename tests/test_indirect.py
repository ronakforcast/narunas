"""End-to-end test of the indirect-trade math on a synthetic BACI-like zip.

Scenario (values in thousand USD):
    LTU -> KAZ: HS4 1234 = 100, HS4 5678 = 50
    KAZ -> RUS: HS4 1234 = 80,  HS4 5678 = 60
    GER -> LTU: HS4 1234 = 200

Expected estimate (in USD millions):
    estimate(LTU, RUS, KAZ) = min(0.100, 0.080) + min(0.050, 0.060) = 0.130
    estimate(GER, RUS, KAZ) = 0 (Germany exports nothing to Kazakhstan)
"""
import sqlite3
import sys
import zipfile
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from build_indirect import YearFlows, estimate_matrix, process_year  # noqa: E402

CODE_TO_IDX = {"440": 0, "643": 1, "398": 2, "276": 3}  # LTU RUS KAZ GER
ISO3S = ["LTU", "RUS", "KAZ", "GER"]

CSV = (
    "t,i,j,k,v\n"
    "2024,440,398,123410,100\n"   # LTU->KAZ product 1234
    "2024,440,398,567810,50\n"   # LTU->KAZ product 5678
    "2024,398,643,123410,80\n"   # KAZ->RUS product 1234
    "2024,398,643,567810,60\n"   # KAZ->RUS product 5678
    "2024,276,440,123410,200\n"  # GER->LTU product 1234
)


@pytest.fixture
def flows(tmp_path: Path) -> YearFlows:
    zp = tmp_path / "mini.zip"
    with zipfile.ZipFile(zp, "w") as z:
        z.writestr("BACI_HS12_Y2024_V202601.csv", CSV)
    with zipfile.ZipFile(zp) as z:
        return YearFlows(z, 2024, {int(k): v for k, v in CODE_TO_IDX.items()})


def test_pair_vector_totals(flows: YearFlows) -> None:
    # LTU -> KAZ total = (100 + 50) / 1000 = 0.15 M
    v = flows.pair_vector(CODE_TO_IDX["440"], CODE_TO_IDX["398"])
    assert v.sum() == pytest.approx(0.15)
    # GER -> LTU total = 0.2 M
    v = flows.pair_vector(CODE_TO_IDX["276"], CODE_TO_IDX["440"])
    assert v.sum() == pytest.approx(0.2)


def test_estimate_via_kazakhstan(flows: YearFlows) -> None:
    V = flows.leg_matrix_into(CODE_TO_IDX["398"])  # exports into KAZ
    W = flows.leg_matrix_out(CODE_TO_IDX["398"])  # exports out of KAZ
    est = estimate_matrix(V, W)
    ltu, rus = CODE_TO_IDX["440"], CODE_TO_IDX["643"]
    assert est[ltu, rus] == pytest.approx(0.13, abs=1e-6)
    ger = CODE_TO_IDX["276"]
    assert est[ger, rus] == pytest.approx(0.0, abs=1e-9)


def test_process_year_stores_rows(
    flows: YearFlows, tmp_path: Path, monkeypatch
) -> None:
    # the fixture flows are far below the $1M production threshold
    monkeypatch.setattr(
        "build_indirect.MIN_C_TOTAL", 0.0
    )
    conn = sqlite3.connect(tmp_path / "t.db")
    conn.executescript(
        "CREATE TABLE indirect_goods (year INTEGER, exporter TEXT, "
        "importer TEXT, intermediary TEXT, estimate REAL, top_products TEXT)"
    )
    process_year(conn, flows, ISO3S, 2024)
    row = conn.execute(
        "SELECT estimate FROM indirect_goods WHERE exporter='LTU' AND "
        "importer='RUS' AND intermediary='KAZ'"
    ).fetchone()
    assert row is not None
    assert row[0] == pytest.approx(0.13, abs=1e-6)
    # intermediary cannot be exporter or importer
    bad = conn.execute(
        "SELECT COUNT(*) FROM indirect_goods WHERE intermediary IN "
        "(exporter, importer)"
    ).fetchone()[0]
    assert bad == 0
    conn.close()
