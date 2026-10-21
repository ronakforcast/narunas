"""API tests against a small fixture database."""
import sqlite3
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server import api as api_mod  # noqa: E402
from server.app import app  # noqa: E402

SCHEMA = """
CREATE TABLE countries (iso3 TEXT PRIMARY KEY, code INTEGER UNIQUE,
    name TEXT, iso2 TEXT);
CREATE TABLE direct_goods (year INTEGER, exporter TEXT, importer TEXT,
    value REAL);
CREATE TABLE direct_services (year INTEGER, exporter TEXT, importer TEXT,
    value REAL);
CREATE TABLE flows_goods_hs6 (year INTEGER, exporter TEXT, importer TEXT,
    hs6 TEXT, value REAL);
CREATE TABLE products (hs6 TEXT PRIMARY KEY, description TEXT);
CREATE TABLE indirect_goods (year INTEGER, exporter TEXT, importer TEXT,
    intermediary TEXT, estimate REAL, top_products TEXT);
CREATE TABLE tiva (year INTEGER, origin TEXT, dest TEXT, measure TEXT,
    value REAL);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
"""


@pytest.fixture
def client(tmp_path: Path, monkeypatch) -> TestClient:
    db = tmp_path / "t.db"
    conn = sqlite3.connect(db)
    conn.executescript(SCHEMA)
    conn.executemany(
        "INSERT INTO countries VALUES (?,?,?,?)",
        [("LTU", 440, "Lithuania", "LT"), ("RUS", 643, "Russia", "RU")],
    )
    conn.executemany(
        "INSERT INTO direct_goods VALUES (?,?,?,?)",
        [(2023, "LTU", "RUS", 700.0), (2024, "LTU", "RUS", 688.0),
         (2024, "RUS", "LTU", 237.0)],
    )
    conn.execute("INSERT INTO direct_services VALUES (2024,'LTU','RUS',12.0)")
    conn.executemany(
        "INSERT INTO flows_goods_hs6 VALUES (?,?,?,?,?)",
        [(2024, "LTU", "RUS", "847150", 88.0)],
    )
    conn.execute("INSERT INTO products VALUES ('847150','Automatic data machines')")
    conn.execute(
        "INSERT INTO indirect_goods VALUES (2024,'LTU','RUS','KAZ',55.5,"
        "'[[\"8471\", 40.0]]')"
    )
    conn.execute(
        "INSERT INTO tiva VALUES (2022,'LTU','RUS','FFD_DVA',1158.9)"
    )
    conn.execute(
        "INSERT INTO meta VALUES ('baci_version','test')"
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr(api_mod, "DB", db)
    return TestClient(app)


def test_countries(client: TestClient) -> None:
    res = client.get("/api/countries")
    assert res.status_code == 200
    body = res.json()
    assert {"iso3": "LTU", "name": "Lithuania", "iso2": "LT"} in body


def test_pair_known(client: TestClient) -> None:
    res = client.get("/api/pair", params={"from": "LTU", "to": "RUS"})
    assert res.status_code == 200
    body = res.json()
    assert body["goods"]["years"] == [2023, 2024]
    assert body["goods"]["from_to"][-1] == 688.0
    assert body["goods"]["to_from"][-1] == 237.0
    assert body["goods"]["from_to_products"][0]["hs6"] == "847150"
    assert body["services"]["from_to"] == [12.0]
    assert body["indirect"]["year"] == 2024
    assert body["indirect"]["from_to"][0]["intermediary"] == "KAZ"
    assert body["indirect"]["from_to"][0]["estimate_musd"] == 55.5
    assert body["indirect"]["from_to"][0]["top_products"][0]["hs4"] == "8471"
    assert body["tiva"]["measures"]["FFD_DVA"] == [1158.9]
    assert body["meta"]["baci_version"] == "test"
    # no intermediaries in reverse direction -> empty list, not error
    assert body["indirect"]["to_from"] == []


def test_pair_unknown_country(client: TestClient) -> None:
    res = client.get("/api/pair", params={"from": "LTU", "to": "ZZZ"})
    assert res.status_code == 404


def test_pair_same_country(client: TestClient) -> None:
    res = client.get("/api/pair", params={"from": "LTU", "to": "LTU"})
    assert res.status_code == 400


def test_monthly_available(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(api_mod, "_monthly_cache", {})

    def fake_fetch(reporter: str, partner: str, start: str):
        if reporter == "LT":
            return [
                {"period": "2026-07", "value_meur": 20.5},
                {"period": "2026-08", "value_meur": 21.0},
            ]
        return []

    monkeypatch.setattr(api_mod, "_fetch_monthly_direction", fake_fetch)
    res = client.get("/api/monthly", params={"from": "LTU", "to": "RUS"})
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is True
    assert body["currency"] == "EUR"
    assert body["from_to"][0] == {"period": "2026-07", "value_meur": 20.5}
    assert body["to_from"] == []


def test_monthly_unavailable(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(api_mod, "_monthly_cache", {})
    monkeypatch.setattr(
        api_mod, "_fetch_monthly_direction", lambda r, p, s: []
    )
    res = client.get("/api/monthly", params={"from": "LTU", "to": "RUS"})
    assert res.status_code == 200
    body = res.json()
    assert body["available"] is False
    assert "reason" in body


def test_monthly_unknown_country(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(api_mod, "_monthly_cache", {})
    res = client.get("/api/monthly", params={"from": "LTU", "to": "ZZZ"})
    assert res.status_code == 404
