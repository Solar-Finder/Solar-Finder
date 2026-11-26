"""Auswertungen für die Diagramme der Karte."""
import pytest


@pytest.mark.parametrize("path", ["/stats/building-categories", "/stats/roof-types", "/stats/suitability-classes"])
def test_auswertung_antwortet(api, path):
    r = api.get(path)
    assert r.status_code == 200
    items = r.json()["items"]
    assert items
    assert all(i["building_count"] >= 0 and i["potential_kwp"] >= 0 for i in items)


def test_kategorien_ergeben_zusammen_100_prozent(api):
    # Jedes Gebäude hat genau eine Kategorie (ohne Treffer: "other")
    items = api.get("/stats/building-categories").json()["items"]
    assert sum(i["share_pct"] for i in items) == pytest.approx(100, abs=1)


def test_kategoriefilter_schraenkt_ein(api):
    alle = api.get("/stats/roof-types").json()["items"]
    wohn = api.get("/stats/roof-types", params={"category": "residential"}).json()["items"]
    assert sum(i["building_count"] for i in wohn) <= sum(i["building_count"] for i in alle)
