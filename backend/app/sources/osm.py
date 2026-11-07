"""OpenStreetMap über die Overpass-API: PLZ-Grenzen, Gebäudegrundrisse, erfasste Solaranlagen.

Daten © OpenStreetMap-Mitwirkende, ODbL.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

from shapely.geometry import LineString, mapping
from shapely.ops import polygonize, unary_union

from .cache import DAY, cached

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "pv-prognose-pforzheim/0.2 (Studienprojekt)"

POSTAL_CODES = ["75172", "75173", "75175", "75177", "75179", "75180", "75181"]
_PLZ_REGEX = "^(" + "|".join(POSTAL_CODES) + ")$"
_PLZ_AREA = f'rel["boundary"="postal_code"]["postal_code"~"{_PLZ_REGEX}"];map_to_area->.plz;'


def _overpass(query: str, timeout: int = 300, retries: int = 4) -> dict:
    """Overpass-Abfrage mit Wiederholung bei Überlast (429/502/504)."""
    body = urllib.parse.urlencode({"data": query}).encode()
    for attempt in range(retries):
        req = urllib.request.Request(OVERPASS_URL, data=body, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 502, 503, 504) or attempt == retries - 1:
                raise
            time.sleep(15 * (attempt + 1))
    raise RuntimeError("unreachable")


def _r(v: float) -> float:
    return round(v, 6)


def _relation_polygon(rel: dict):
    """Setzt eine Multipolygon-Relation aus ihren Wegen zusammen (outer minus inner)."""
    def rings(role):
        lines = [
            LineString([(m_pt["lon"], m_pt["lat"]) for m_pt in m["geometry"]])
            for m in rel.get("members", [])
            if m.get("type") == "way" and m.get("role", "outer") == role and len(m.get("geometry", [])) > 1
        ]
        return unary_union(list(polygonize(unary_union(lines)))) if lines else None

    outer = rings("outer")
    inner = rings("inner")
    if outer is None or outer.is_empty:
        return None
    return outer.difference(inner) if inner is not None and not inner.is_empty else outer


def _round_geom(geom: dict) -> dict:
    def walk(c):
        return [walk(x) for x in c] if isinstance(c[0], (list, tuple)) else [_r(c[0]), _r(c[1])]
    return {"type": geom["type"], "coordinates": walk(geom["coordinates"])}


# ---------------- PLZ-Grenzen ----------------
def _fetch_postal_areas() -> dict:
    d = _overpass(f'[out:json][timeout:180];rel["boundary"="postal_code"]["postal_code"~"{_PLZ_REGEX}"];out geom;')
    feats = []
    for rel in d["elements"]:
        poly = _relation_polygon(rel)
        if poly is None:
            continue
        feats.append({
            "postal_code": rel["tags"]["postal_code"],
            "name": rel["tags"].get("note") or rel["tags"]["postal_code"],
            "osm_id": rel["id"],
            "geometry": _round_geom(mapping(poly.simplify(0.00002))),
        })
    return {"retrieved_at": date.today().isoformat(), "areas": sorted(feats, key=lambda f: f["postal_code"])}


def load_postal_areas(force: bool = False) -> dict:
    return cached("osm_postal_areas", 30 * DAY, _fetch_postal_areas, force=force)


# ---------------- Gebäude ----------------
_BUILDING_TAGS = ("building", "amenity", "shop", "office", "industrial", "building:use", "roof:shape", "name")


def _fetch_buildings() -> dict:
    # Pro PLZ-Gebiet abfragen – eine Abfrage für die ganze Stadt ist Overpass zu groß
    elements, seen = [], set()
    for plz in POSTAL_CODES:
        q = (f'[out:json][timeout:240];rel["boundary"="postal_code"]["postal_code"="{plz}"];map_to_area->.a;'
             f'(way["building"](area.a);rel["building"](area.a););out geom;')
        for e in _overpass(q, timeout=300)["elements"]:
            key = (e["type"], e["id"])
            if key not in seen:
                seen.add(key)
                elements.append(e)
        time.sleep(2)  # Overpass schonen

    out = []
    for e in elements:
        tags = e.get("tags", {})
        if e["type"] == "way":
            pts = [[_r(p["lon"]), _r(p["lat"])] for p in e.get("geometry", [])]
            if len(pts) < 4:
                continue
            geom = {"type": "Polygon", "coordinates": [pts]}
        else:
            poly = _relation_polygon(e)
            if poly is None or poly.is_empty:
                continue
            geom = _round_geom(mapping(poly))
        out.append({
            "id": f"{e['type'][0]}{e['id']}",
            "tags": {k: tags[k] for k in _BUILDING_TAGS if k in tags},
            "geometry": geom,
        })
    return {"retrieved_at": date.today().isoformat(), "buildings": out}


def load_buildings(force: bool = False) -> dict:
    return cached("osm_buildings", 30 * DAY, _fetch_buildings, force=force)


# ---------------- In OSM erfasste Solaranlagen ----------------
def _fetch_solar() -> dict:
    d = _overpass(f'[out:json][timeout:180];{_PLZ_AREA}nwr["generator:source"="solar"](area.plz);out center tags;')
    out = []
    for e in d["elements"]:
        lat = e.get("lat") or e.get("center", {}).get("lat")
        lon = e.get("lon") or e.get("center", {}).get("lon")
        if lat is None:
            continue
        t = e.get("tags", {})
        out.append({
            "id": f"{e['type'][0]}{e['id']}",
            "lon": _r(lon), "lat": _r(lat),
            "location": t.get("location"),
            "output": t.get("generator:output:electricity"),
        })
    return {"retrieved_at": date.today().isoformat(), "solar": out}


def load_solar(force: bool = False) -> dict:
    return cached("osm_solar", 7 * DAY, _fetch_solar, force=force)
