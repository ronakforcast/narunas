"""Unit tests for the country code mapping (uses a small fixture file)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from country_map import load_baci_countries, load_products  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fixture_dir(tmp_path: Path) -> Path:
    (tmp_path / "country_codes_V202601.csv").write_text(
        "country_code,country_name,country_iso2,country_iso3\n"
        "440,Lithuania,LT,LTU\n"
        "643,Russia,RU,RUS\n"
        "398,Kazakhstan,KZ,KAZ\n"
        "490,\"Other Asia, nes\",,S19\n"
        "58,\"Belgium-Luxembourg (...1998)\",BE,BEL\n"
        "280,\"Fed. Rep. of Germany (...1990)\",DE,DEU\n"
    )
    return tmp_path


def test_total_and_injective(fixture_dir: Path) -> None:
    countries = load_baci_countries(fixture_dir)
    iso3s = [c["iso3"] for c in countries]
    assert len(iso3s) == len(set(iso3s))
    assert {c["iso3"] for c in countries} == {"LTU", "RUS", "KAZ", "TWN"}


def test_taiwan_is_mapped_to_twn(fixture_dir: Path) -> None:
    countries = load_baci_countries(fixture_dir)
    tw = next(c for c in countries if c["iso3"] == "TWN")
    assert tw["name"] == "Taiwan"
    assert tw["code"] == 490


def test_legacy_aggregates_excluded(fixture_dir: Path) -> None:
    countries = load_baci_countries(fixture_dir)
    assert all(c["code"] not in {58, 280} for c in countries)


def test_products_fixture() -> None:
    (FIXTURES).mkdir(exist_ok=True)
    (FIXTURES / "product_codes_HS12_V202601.csv").write_text(
        "code,description\n010121,Horses: live, pure-bred\n"
    )
    products = load_products(FIXTURES)
    assert products[0]["code"] == "010121"  # leading zero preserved
    assert "Horses" in products[0]["description"]
