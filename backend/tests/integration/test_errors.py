"""Fehlerfälle: falsche Pfade und Parameter dürfen keinen 500er auslösen."""
import httpx
import pytest

from .conftest import BASE_URL


def test_unbekannter_pfad_404(api):
    assert api.get("/gibt-es-nicht").status_code == 404


@pytest.mark.parametrize("params", [{"limit": 0}, {"category": "schloss"}])
def test_ungueltige_gebaeude_parameter_422(api, params):
    assert api.get("/map/buildings", params=params).status_code == 422


def test_unbekannte_kartenart_422(api):
    assert api.get("/tiles/satellit/10/1/1").status_code == 422


@pytest.mark.xfail(strict=True, reason="Bekannter Fehler: _bbox() wirft ValueError → 500 statt 422")
def test_kaputte_bbox_ist_kein_serverfehler(api):
    # Eigene Verbindung: Nach einem 500er schließt der Server sie, der gemeinsame Client bliebe hängen.
    r = httpx.get(f"{BASE_URL}/map/buildings", params={"bbox": "abc"}, timeout=30)
    assert r.status_code < 500
