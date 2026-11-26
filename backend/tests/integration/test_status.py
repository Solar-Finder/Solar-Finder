"""/meta und /status: Grunddaten für Startseite und Rechner."""
import pytest


def test_meta_listet_kategorien_und_plz(meta):
    assert {c["value"] for c in meta["categories"]} >= {"residential", "public", "commercial", "other"}
    assert len(meta["postal_codes"]) > 0


@pytest.mark.parametrize("slider", ["target_utilization_pct", "horizon_years", "electricity_price_ct_per_kwh"])
def test_meta_slider_defaults_liegen_im_bereich(meta, slider):
    s = meta["sliders"][slider]
    assert s["min"] <= s["default"] <= s["max"]
    assert s["step"] > 0


def test_meta_nennt_quellen(meta):
    names = " ".join(src["name"] for src in meta["sources"])
    assert "Marktstammdatenregister" in names
    assert "LUBW" in names


def test_status_kennzahlen_sind_konsistent(api):
    r = api.get("/status")
    assert r.status_code == 200
    s = r.json()
    assert s["installation_count"] > 0
    assert s["potential_power_mwp"] > 0
    assert 0 <= s["utilization_pct"] <= 100
    assert s["installed_roof_power_mwp"] <= s["installed_power_mwp"]
    assert s["located_installation_count"] <= s["installation_count"]
    assert s["balcony_count"] <= s["installation_count"]


def test_status_einer_plz_ist_teil_der_stadt(api, postal_codes):
    city = api.get("/status").json()
    plz = api.get("/status", params={"postal_code": postal_codes[0]}).json()
    assert plz["installation_count"] <= city["installation_count"]
    assert plz["potential_power_mwp"] <= city["potential_power_mwp"]
