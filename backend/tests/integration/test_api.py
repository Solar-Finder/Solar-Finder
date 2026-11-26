# backend/tests/integration/test_api.py
def test_status(api):
    assert api.get("/status").status_code == 200

def test_postal_areas_is_geojson(api):
    body = api.get("/map/postal-areas").json()
    assert body["type"] == "FeatureCollection"

def test_unknown_route_404(api):
    assert api.get("/gibt-es-nicht").status_code == 404