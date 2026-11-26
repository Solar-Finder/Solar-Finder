"""Strompreis, Degradation und Amortisation (app/data_service.py)."""
import pytest

from app import data_service as ds


def test_strompreis_steigt_linear():
    assert ds._price_for_year(1, 20.0) == 20.0
    assert ds._price_for_year(3, 20.0) == pytest.approx(20.0 + 2 * ds.PRICE_INCREASE_CT_PER_YEAR)


def test_ertrag_sinkt_durch_degradation():
    assert ds._energy_for_year(1, 1000) == 1000
    assert ds._energy_for_year(2, 1000) == pytest.approx(1000 * (1 - ds.DEGRADATION_PCT_PER_YEAR / 100))
    assert ds._energy_for_year(20, 1000) < ds._energy_for_year(10, 1000)


def test_stromwert_im_ersten_jahr():
    # 1000 kWh × 20 ct = 200 €
    assert ds._value_for_year(1, 1000, 20.0) == pytest.approx(200.0)


@pytest.mark.parametrize("purchase, expected", [(0, 0.0), (100, 0.5), (200, 1.0)])
def test_amortisation_im_ersten_jahr(purchase, expected):
    assert ds._amortization(purchase, 1000, 20.0) == expected


def test_amortisation_ohne_ertrag_nie():
    assert ds._amortization(5000, 0, 20.0) is None


def test_amortisation_waechst_mit_kaufpreis():
    assert ds._amortization(2000, 1000, 20.0) < ds._amortization(4000, 1000, 20.0)


def test_prozent_ohne_division_durch_null():
    assert ds._pct(1, 4) == 25.0
    assert ds._pct(5, 0) == 0.0
