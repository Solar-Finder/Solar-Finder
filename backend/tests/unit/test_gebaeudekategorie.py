"""Zuordnung von OSM-Tags zu Gebäudekategorien (app/geo_model.py)."""
import pytest

from app import geo_model as gm


@pytest.mark.parametrize("tags, expected", [
    ({"building": "house"}, "residential"),
    ({"building": "school"}, "public"),
    ({"building": "warehouse"}, "commercial"),
    ({"building": "barn"}, "agricultural"),
    ({"building": "yes", "amenity": "library"}, "public"),
    ({"building": "yes", "shop": "bakery"}, "commercial"),
    ({"building": "yes"}, "other"),
    ({}, "other"),
])
def test_kategorie(tags, expected):
    assert gm._category(tags) == expected


def test_nur_gebaeudesolaranlagen_zaehlen_zum_dach():
    assert gm.is_roof_unit({"plant_type": "Gebäudesolaranlage"})
    assert not gm.is_roof_unit({"plant_type": gm.GROUND_PLANT_TYPE})
    assert not gm.is_roof_unit({})


def test_koordinaten_werden_auf_6_stellen_gerundet():
    geom = {"type": "Point", "coordinates": [8.7012345678, 48.8912345678]}
    assert gm._round_coords(geom)["coordinates"] == [8.701235, 48.891235]
