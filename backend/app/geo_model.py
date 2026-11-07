"""Räumliches Datenmodell: LUBW-Gebäude als Basis, ergänzt um OSM und MaStR.

Ablauf beim ersten Zugriff (danach im Speicher), Details in docs/datenmodell.md:
1. LUBW-Dachseiten → Gebäude mit Potenzial (kWp, kWh/a, CO₂), Eignungsklasse, Dachform
2. Gebäudemittelpunkt → PLZ-Gebiet (OSM)
3. Gebäudemittelpunkt → OSM-Gebäude → Kategorie, Gebäudeart, Name
4. MaStR-Anlagen mit Koordinaten (nur > 30 kW öffentlich) und in OSM erfasste
   Dachanlagen → Gebäude (enthaltend oder nächstes im Umkreis)

OSM ist optional: Ist Overpass nicht erreichbar und kein Cache vorhanden, bleiben PLZ und
Kategorie leer bzw. „other“. Die Potenzial- und Bestandssummen sind davon nicht betroffen.
"""
from __future__ import annotations

import logging
import math
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

from shapely import STRtree
from shapely.geometry import Point, mapping, shape

from .sources import lubw, mastr, osm

log = logging.getLogger(__name__)

MATCH_RADIUS_M = 25                     # max. Abstand Anlage ↔ Gebäude, falls nicht innerhalb
ROOF_PLANT_TYPES = {"Gebäudesolaranlage"}  # MaStR-Anlagentypen, die zum Dachpotenzial zählen
GROUND_PLANT_TYPE = "Freiflächensolaranlage"

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

_MY = 110_540  # Meter je Grad Breite


def _round_coords(geom: dict) -> dict:
    def walk(c):
        return [walk(x) for x in c] if isinstance(c[0], (list, tuple)) else [round(c[0], 6), round(c[1], 6)]
    return {"type": geom["type"], "coordinates": walk(geom["coordinates"])}


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
    id: str                              # "L<LUBW-BuildingID>"
    geom: object
    geojson: dict
    center: tuple                        # Punkt sicher im Umriss (lon, lat)
    footprint_m2: float
    potential_kwp: float                 # Σ Power, Klassen 1–3 (LUBW)
    potential_kwh_per_year: float        # Σ Yield, Klassen 1–3 (LUBW)
    co2_savings_kg_per_year: float       # Σ CO2Savings, Klassen 1–3 (LUBW)
    suitability: int                     # beste Klasse (1, 2, 3, 6, 8, 0)
    roof_type: str                       # flat / pitched / mixed / unknown
    roof_faces: int
    suitable_roof_faces: int
    category: str = "other"
    building_type: Optional[str] = None  # OSM building=*
    osm_id: Optional[str] = None
    name: Optional[str] = None
    postal_code: Optional[str] = None
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
        return "potential" if self.potential_kwp > 0 else "none"


@dataclass
class Model:
    retrieved: dict
    lubw: dict           # Metadaten + Gesamtsummen des LUBW-Datensatzes
    osm_available: bool
    areas: list          # [{postal_code, name, geom, geometry}]
    buildings: list      # [Building]
    by_id: dict
    tree: STRtree
    units: list          # MaStR-Einheiten (dict) inkl. building_id
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


def is_roof_unit(u: dict) -> bool:
    return u.get("plant_type") in ROOF_PLANT_TYPES


def _optional(loader, name):
    try:
        return loader()
    except Exception:  # noqa: BLE001 – OSM ist Zusatzinformation
        log.exception("OSM-Daten „%s“ nicht verfügbar – fahre ohne fort", name)
        return None


def _build() -> Model:
    roof_data = lubw.load()
    m_data = mastr.load()
    a_data = _optional(osm.load_postal_areas, "PLZ-Grenzen")
    b_data = _optional(osm.load_buildings, "Gebäude")
    s_data = _optional(osm.load_solar, "Solaranlagen")

    buildings = [
        Building(
            id=r["id"], geom=r["geometry"], geojson=_round_coords(mapping(r["geometry"])), center=r["center"],
            footprint_m2=r["footprint_m2"], potential_kwp=r["potential_kwp"],
            potential_kwh_per_year=r["potential_kwh_per_year"],
            co2_savings_kg_per_year=r["co2_savings_kg_per_year"], suitability=r["suitability"],
            roof_type=r["roof_type"], roof_faces=r["roof_faces"], suitable_roof_faces=r["suitable_roof_faces"],
        )
        for r in roof_data["buildings"]
    ]
    centers = [Point(b.center) for b in buildings]

    # 2. PLZ
    areas = [{**a, "geom": shape(a["geometry"])} for a in (a_data or {}).get("areas", [])]
    if areas:
        area_tree = STRtree([a["geom"] for a in areas])
        idx_pt, idx_area = area_tree.query(centers, predicate="within")
        for i, j in zip(idx_pt, idx_area):
            buildings[i].postal_code = areas[j]["postal_code"]

    # 3. OSM-Gebäude → Kategorie
    if b_data:
        osm_b = []
        for raw in b_data["buildings"]:
            g = shape(raw["geometry"])
            if not g.is_valid:
                g = g.buffer(0)
            if not g.is_empty:
                osm_b.append((g, raw))
        osm_tree = STRtree([g for g, _ in osm_b])
        idx_pt, idx_osm = osm_tree.query(centers, predicate="within")
        for i, j in zip(idx_pt, idx_osm):
            b = buildings[i]
            if b.osm_id:          # mehrere OSM-Treffer: ersten behalten
                continue
            tags = osm_b[j][1]["tags"]
            b.osm_id, b.category = osm_b[j][1]["id"], _category(tags)
            b.building_type, b.name = tags.get("building"), tags.get("name")

    tree = STRtree([b.geom for b in buildings])
    radius_deg = MATCH_RADIUS_M / _MY

    def match(lon: float, lat: float) -> Optional[Building]:
        p = Point(lon, lat)
        hits = tree.query(p, predicate="intersects")
        if len(hits):
            return buildings[hits[0]]
        idx = tree.query_nearest(p, max_distance=radius_deg)
        return buildings[idx[0]] if len(idx) else None

    # 4a. MaStR-Anlagen mit Koordinaten (ohne Freiflächen)
    units = m_data["units"]
    for u in units:
        u["building_id"] = None
        if u.get("lat") and u.get("lon") and u.get("plant_type") != GROUND_PLANT_TYPE:
            b = match(u["lon"], u["lat"])
            if b:
                b.mastr_ids.append(u["id"])
                b.installed_kwp += u["power_kwp"]
                u["building_id"] = b.id

    # 4b. In OSM erfasste Dachanlagen
    for s in (s_data or {}).get("solar", []):
        if s.get("location") in ("ground", "underground"):
            continue
        b = match(s["lon"], s["lat"])
        if b:
            b.osm_solar = True

    # Kennzahlen je PLZ
    stats = defaultdict(lambda: {"installed_kwp": 0.0, "installed_roof_kwp": 0.0, "units": 0, "located": 0,
                                 "balcony": 0, "potential_kwp": 0.0, "potential_kwh": 0.0, "buildings": 0,
                                 "buildings_with_solar": 0, "buildings_potential": 0})
    for u in units:
        st = stats[u["postal_code"]]
        st["installed_kwp"] += u["power_kwp"]
        st["installed_roof_kwp"] += u["power_kwp"] if is_roof_unit(u) else 0.0
        st["units"] += 1
        st["located"] += 1 if u.get("lat") else 0
        st["balcony"] += 1 if "Balkon" in (u.get("plant_type") or "") else 0
    for b in buildings:
        if not b.postal_code:
            continue
        st = stats[b.postal_code]
        st["potential_kwp"] += b.potential_kwp
        st["potential_kwh"] += b.potential_kwh_per_year
        st["buildings"] += 1
        st["buildings_with_solar"] += b.has_solar
        st["buildings_potential"] += b.solar_status == "potential"

    log.info("Modell: %d Gebäude, davon %d mit PLZ, %d mit OSM-Gebäude, %d mit Anlage",
             len(buildings), sum(1 for b in buildings if b.postal_code),
             sum(1 for b in buildings if b.osm_id), sum(1 for b in buildings if b.has_solar))

    return Model(
        retrieved={
            "mastr": m_data["retrieved_at"],
            "lubw": roof_data["loaded_at"],
            "osm_buildings": (b_data or {}).get("retrieved_at"),
            "osm_postal_areas": (a_data or {}).get("retrieved_at"),
            "osm_solar": (s_data or {}).get("retrieved_at"),
        },
        lubw={k: roof_data[k] for k in ("data_year", "origin", "totals")},
        osm_available=bool(a_data and b_data),
        areas=areas, buildings=buildings, by_id={b.id: b for b in buildings}, tree=tree,
        units=units, plz_stats=dict(stats),
    )
