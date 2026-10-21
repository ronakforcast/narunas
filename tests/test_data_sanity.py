"""Sanity checks against the real built database (skipped if not built)."""
import sqlite3
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DB = Path(__file__).resolve().parent.parent / "data" / "trade.db"

pytestmark = pytest.mark.skipif(
    not DB.exists(), reason="data/trade.db not built — run `make build-db`"
)


@pytest.fixture(scope="module")
def conn():
    c = sqlite3.connect(DB)
    yield c
    c.close()


def test_world_goods_total_plausible(conn: sqlite3.Connection) -> None:
    total = conn.execute(
        "SELECT SUM(value) FROM direct_goods WHERE year=2024"
    ).fetchone()[0]
    # ~$24T world trade in 2024; BACI FOB-reconciled lands slightly below
    assert 19_000_000 < total < 27_000_000, total


def test_lithuania_russia_sanctions_collapse(conn: sqlite3.Connection) -> None:
    pre = conn.execute(
        "SELECT value FROM direct_goods WHERE year=2021 AND exporter='LTU' "
        "AND importer='RUS'"
    ).fetchone()
    post = conn.execute(
        "SELECT value FROM direct_goods WHERE year=2024 AND exporter='LTU' "
        "AND importer='RUS'"
    ).fetchone()
    assert pre and post
    # exports collapsed after the 2022 sanctions
    assert post[0] < 0.5 * pre[0], (pre[0], post[0])


def test_intermediaries_present_for_lt_rus(conn: sqlite3.Connection) -> None:
    rows = conn.execute(
        "SELECT intermediary FROM indirect_goods WHERE year=2024 AND "
        "exporter='LTU' AND importer='RUS'"
    ).fetchall()
    intermediaries = {r[0] for r in rows}
    # both value-chain hubs and known re-routing corridors appear
    assert {"DEU", "POL"} & intermediaries
    assert {"KAZ", "TUR", "LVA"} & intermediaries


def test_services_present(conn: sqlite3.Connection) -> None:
    v = conn.execute(
        "SELECT value FROM direct_services WHERE year=2024 AND "
        "exporter='LTU' AND importer='RUS'"
    ).fetchone()
    assert v and v[0] > 0


def test_tiva_present(conn: sqlite3.Connection) -> None:
    v = conn.execute(
        "SELECT value FROM tiva WHERE origin='LTU' AND dest='RUS' AND "
        "measure='FFD_DVA' AND year=2022"
    ).fetchone()
    assert v and v[0] > 0
