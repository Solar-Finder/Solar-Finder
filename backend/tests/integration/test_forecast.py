"""POST /forecast: Prognose für den Rechner auf der Startseite."""
import pytest


def _forecast(api, target=60, years=20, price=30):
    return api.post("/forecast", json={
        "target_utilization_pct": target, "horizon_years": years, "electricity_price_ct_per_kwh": price,
    })


def test_prognose_grundstruktur(api):
    r = _forecast(api, years=20)
    assert r.status_code == 200
    f = r.json()
    assert len(f["timeline"]) == 21                     # Jahr 0 (Start) bis Jahr 20
    assert [y["year_index"] for y in f["timeline"]] == list(range(21))
    assert f["timeline"][0]["cumulative_balance_eur"] == -f["purchase_cost_eur"]
    assert f["investment_eur"] == pytest.approx(f["purchase_cost_eur"] + f["maintenance_cost_total_eur"], abs=1)


def test_hoeheres_ziel_bedeutet_mehr_zubau(api):
    low = _forecast(api, target=50).json()
    high = _forecast(api, target=90).json()
    assert high["new_power_mwp"] >= low["new_power_mwp"]
    assert high["purchase_cost_eur"] >= low["purchase_cost_eur"]


def test_ziel_unter_bestand_ergibt_keinen_zubau(api):
    f = _forecast(api, target=0).json()
    assert f["new_power_mwp"] == 0
    assert f["purchase_cost_eur"] == 0


def test_hoeherer_strompreis_amortisiert_schneller(api):
    cheap = _forecast(api, target=80, price=20).json()["amortization_years"]
    dear = _forecast(api, target=80, price=40).json()["amortization_years"]
    if cheap is not None and dear is not None:
        assert dear <= cheap


@pytest.mark.parametrize("body", [
    {"target_utilization_pct": 150, "horizon_years": 20, "electricity_price_ct_per_kwh": 30},
    {"target_utilization_pct": 60, "horizon_years": 0, "electricity_price_ct_per_kwh": 30},
    {"target_utilization_pct": 60, "horizon_years": 20, "electricity_price_ct_per_kwh": -1},
    {"target_utilization_pct": 60},
])
def test_ungueltige_eingaben_werden_abgelehnt(api, body):
    assert api.post("/forecast", json=body).status_code == 422
