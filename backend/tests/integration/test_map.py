"""Kartendaten: PLZ-Gebiete, Gebäude, Gebäudepunkte, Anlagen."""
from .conftest import CITY_CENTER_BBOX


def test_plz_gebiete_sind_geojson(api, postal_codes):
    r = api.get("/map/postal-areas")
    assert r.status_code == 200
    body = r.json()
    assert body["type"] == "FeatureCollection"
    assert {f["id"] for f in body["features"]} == set(postal_codes)
    for f in body["features"]:
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon")
        assert 0 <= f["properties"]["utilization_pct"] <= 100


def test_plz_filter_liefert_genau_ein_gebiet(api, postal_codes):
    body = api.get("/map/postal-areas", params={"postal_code": postal_codes[0]}).json()
    assert [f["id"] for f in body["features"]] == [postal_codes[0]]


def test_gebaeude_im_ausschnitt_respektieren_limit(api):
    body = api.get("/map/buildings", params={"bbox": CITY_CENTER_BBOX, "limit": 25}).json()
    assert 0 < len(body["features"]) <= 25
    for f in body["features"]:
        assert f["id"].startswith("L")
        assert f["properties"]["potential_kwp"] >= 0


def test_gebaeude_kategoriefilter(api):
    body = api.get("/map/buildings",
                   params={"bbox": CITY_CENTER_BBOX, "category": "residential", "limit": 50}).json()
    assert body["features"], "keine Wohngebäude im Innenstadt-Ausschnitt"
    assert {f["properties"]["category"] for f in body["features"]} == {"residential"}


def test_gebaeudepunkte_format(api):
    body = api.get("/map/building-points", params={"solar_status": "existing"}).json()
    assert body["points"]
    for lon, lat, status, _klasse, kwp in body["points"][:100]:
        assert 8.5 < lon < 8.9 and 48.7 < lat < 49.0   # grob Pforzheim
        assert status == 1                             # 1 = existing
        assert kwp >= 0


def test_anlagen_leistungsfilter(api):
    body = api.get("/map/installations", params={"max_power_kwp": 100}).json()
    assert body["type"] == "FeatureCollection"
    assert all(f["properties"]["power_kwp"] <= 100 for f in body["features"])
