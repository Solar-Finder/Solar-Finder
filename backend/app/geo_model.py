"""Räumliches Datenmodell: verknüpft MaStR-Anlagen, OSM-Gebäude und PLZ-Gebiete.

Ablauf beim ersten Zugriff (danach im Speicher):
1. Gebäude → PLZ-Gebiet (Schwerpunkt im Polygon)
2. MaStR-Anlagen mit Koordinaten (nur > 30 kW öffentlich) und in OSM erfasste
   Dachanlagen → Gebäude (enthaltend oder nächstes im Umkreis)
3. Dachpotenzial je Gebäude – bis die LUBW-Dachflächendaten angebunden sind
   als SCHÄTZUNG aus der Grundfläche (siehe POTENTIAL_*).
"""
from __future__ import annotations

import math
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from shapely import STRtree
from shapely.geometry import Point, shape

from .sources import mastr, osm

# ---- Potenzialschätzung (Platzhalter bis LUBW-Daten) ----
POTENTIAL_SOURCE = "estimate"          # später: "lubw"
POTENTIAL_USABLE_ROOF_SHARE = 0.5      # nutzbarer Anteil der Grundfläche als Modulfläche
POTENTIAL_KWP_PER_M2 = 0.18            # ca. 5,5 m² Modulfläche je kWp
MIN_FOOTPRINT_M2 = 20                  # kleinere Gebäude: kein nennenswertes Potenzial
MIN_POTENTIAL_KWP = 3                  # darunter gilt ein Dach nicht als „ungenutztes Potenzial“

MATCH_RADIUS_M = 25                    # max. Abstand Anlage ↔ Gebäude, falls nicht innerhalb

# Gebäude ohne PV-Eignung (Garagen, Schuppen, Gewächshäuser …)
NO_POTENTIAL_TYPES = {
    "garage", "garages", "carport", "shed", "hut", "roof", "ruins", "construction", "container",
    "kiosk", "toilets", "transformer_tower", "bunker", "greenhouse", "allotment_house", "bridge",
    "tent", "collapsed", "storage_tank", "silo",
}
CATEGORY_BY_BUILDING = {
    **dict.fromkeys(["house", "apartments", "residential", "detached", "semidetached_house", "terrace",
                     "dormitory", "bungalow", "row_house"], "residential"),
    **dict.fromkeys(["school", "kindergarten", "public", "civic", "hospital", "church", "chapel", "government",
                     "university", "college", "sports_hall", "fire_station", "train_station", "townhall",
                     "museum", "library", "community_centre"], "public"),
    **dict.fromkeys(["commercial", "industrial", "retail", "office", "warehouse", "service", "supermarket",
                     "manufacture", "hotel", "garage_workshop"], "commercial"),
    **dict.fromkeys(["farm", "barn", "farm_auxiliary", "stable", "cowshed", "sty"], "agricultural"),
}
PUBLIC_AMENITIES = {"school", "kindergarten", "townhall", "hospital", "library", "place_of_worship",
                    "fire_station", "police", "community_centre", "university", "college"}

_LAT0 = 48.89
_MX = 111_320 * math.cos(math.radians(_LAT0))  # Meter je Grad Länge
_MY = 110_540                                  # Meter je Grad Breite


def _area_m2(geom) -> float:
    return geom.area * _MX * _MY


def _category(tags: dict) -> str:
    b = tags.get("building", "yes")
    if b in CATEGORY_BY_BUILDING:
        return CATEGORY_BY_BUILDING[b]
    if tags.get("amenity") in PUBLIC_AMENITIES:
        return "public"
    if tags.get("shop") or tags.get("office") or tags.get("industrial"):
        return "commercial"
    return "other"


@dataclass
class Building:
    id: str
    geom: object
    geojson: dict
    category: str
    building_type: str
    footprint_m2: float
    potential_kwp: float
    postal_code: Optional[str] = None
    name: Optional[str] = None
    center: tuple = (0.0, 0.0)  # Punkt sicher innerhalb des Grundrisses (lon, lat)
    installed_kwp: float = 0.0
    mastr_ids: list = field(default_factory=list)
    osm_solar: bool = False

    @property
    def has_solar(self) -> bool:
        return bool(self.mastr_ids) or self.osm_solar

    @property
    def solar_status(self) -> str:
        if self.has_solar:
            return "existing"
        return "potential" if self.potential_kwp >= MIN_POTENTIAL_KWP else "none"


@dataclass
class Model:
    retrieved: dict
    areas: list          # [{postal_code, name, geom, geojson}]
    buildings: list      # [Building]
    by_id: dict          # Gebäude-ID → Building
    tree: STRtree
    units: list          # MaStR-Einheiten (dict) inkl. building_id
    located_units: list
    plz_stats: dict      # PLZ → Kennzahlen


_lock = threading.Lock()
_model: Optional[Model] = None


def get_model() -> Model:
    global _model
    with _lock:
        if _model is None:
            _model = _build()
        return _model


def reset_model() -> None:
    global _model
    with _lock:
        _model = None


def _build() -> Model:
    m_data = mastr.load()
    a_data = osm.load_postal_areas()
    b_data = osm.load_buildings()
    s_data = osm.load_solar()

    areas = [{**a, "geom": shape(a["geometry"])} for a in a_data["areas"]]
    area_tree = STRtree([a["geom"] for a in areas])

    buildings: list[Building] = []
    for raw in b_data["buildings"]:
        g = shape(raw["geometry"])
        if g.is_empty or not g.is_valid:
            g = g.buffer(0)
            if g.is_empty:
                continue
        tags = raw["tags"]
        btype = tags.get("building", "yes")
        fp = _area_m2(g)
        eligible = btype not in NO_POTENTIAL_TYPES and fp >= MIN_FOOTPRINT_M2
        kwp = fp * POTENTIAL_USABLE_ROOF_SHARE * POTENTIAL_KWP_PER_M2 if eligible else 0.0
        c = g.representative_point()
        hits = area_tree.query(c, predicate="within")
        buildings.append(Building(
            id=raw["id"], geom=g, geojson=raw["geometry"], category=_category(tags), building_type=btype,
            footprint_m2=round(fp, 1), potential_kwp=round(kwp, 1),
            postal_code=areas[hits[0]]["postal_code"] if len(hits) else None, name=tags.get("name"),
            center=(round(c.x, 6), round(c.y, 6)),
        ))
    tree = STRtree([b.geom for b in buildings])
    radius_deg = MATCH_RADIUS_M / _MY

    def match(lon: float, lat: float) -> Optional[Building]:
        p = Point(lon, lat)
        hits = tree.query(p, predicate="intersects")
        if len(hits):
            return buildings[hits[0]]
        idx = tree.query_nearest(p, max_distance=radius_deg)
        return buildings[idx[0]] if len(idx) else None

    # MaStR-Anlagen mit Koordinaten
    units = m_data["units"]
    located = []
    for u in units:
        u["building_id"] = None
        if u.get("lat") and u.get("lon"):
            located.append(u)
            if u.get("plant_type") == "Freiflächensolaranlage":
                continue
            b = match(u["lon"], u["lat"])
            if b:
                b.mastr_ids.append(u["id"])
                b.installed_kwp += u["power_kwp"]
                u["building_id"] = b.id

    # In OSM erfasste Dachanlagen (ohne Freiflächen)
    for s in s_data["solar"]:
        if s.get("location") in ("ground", "underground"):
            continue
        b = match(s["lon"], s["lat"])
        if b:
            b.osm_solar = True

    # Kennzahlen je PLZ
    stats = defaultdict(lambda: {"installed_kwp": 0.0, "units": 0, "located": 0, "balcony": 0,
                                 "potential_kwp": 0.0, "buildings": 0, "buildings_with_solar": 0,
                                 "buildings_potential": 0})
    for u in units:
        st = stats[u["postal_code"]]
        st["installed_kwp"] += u["power_kwp"]
        st["units"] += 1
        st["located"] += 1 if u.get("lat") else 0
        st["balcony"] += 1 if "Balkon" in (u.get("plant_type") or "") else 0
    for b in buildings:
        if not b.postal_code:
            continue
        st = stats[b.postal_code]
        st["potential_kwp"] += b.potential_kwp
        st["buildings"] += 1
        st["buildings_with_solar"] += b.has_solar
        st["buildings_potential"] += b.solar_status == "potential"

    return Model(
        retrieved={"mastr": m_data["retrieved_at"], "osm_buildings": b_data["retrieved_at"],
                   "osm_postal_areas": a_data["retrieved_at"], "osm_solar": s_data["retrieved_at"]},
        areas=areas, buildings=buildings, by_id={b.id: b for b in buildings}, tree=tree, units=units, located_units=located, plz_stats=dict(stats),
    )
