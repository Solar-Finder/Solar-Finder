"""Anschaffungskosten je kWp (app/sources/costs.py), gelesen aus data/Tabelle_Anschaffungskosten_PVprokWp.md."""
import pytest

from app.sources import costs


def test_deutsches_zahlenformat():
    assert costs._num("1.530") == 1530.0
    assert costs._num("3,5") == 3.5


def test_tabelle_wird_gelesen_und_ist_sortiert():
    table = costs.price_table()
    assert len(table) >= 2
    limits = [limit for limit, _ in table]
    assert limits == sorted(limits)


def test_groessere_anlagen_sind_pro_kwp_nicht_teurer():
    prices = [price for _, price in costs.price_table()]
    assert prices == sorted(prices, reverse=True)


@pytest.mark.parametrize("kwp", [0.5, 3.5, 10, 200])
def test_innerhalb_der_tabelle_kein_annahme_flag(kwp):
    _, outside = costs.price_per_kwp(kwp)
    assert outside is False


def test_grenze_gehoert_zur_unteren_stufe():
    first_limit, first_price = costs.price_table()[0]
    assert costs.price_per_kwp(first_limit) == (first_price, False)


def test_ueber_der_tabelle_letzter_preis_mit_flag():
    last_limit, last_price = costs.price_table()[-1]
    assert costs.price_per_kwp(last_limit + 1) == (last_price, True)
