"""Fallback für OSM-Daten ohne Overpass: Geofabrik-Auszug (.osm.pbf) lokal auswerten.

Geofabrik aktualisiert die Auszüge täglich. Die Datei für den Regierungsbezirk Karlsruhe
(~155 MB) wird nur geladen, wenn Overpass nicht erreichbar ist, und dann höchstens einmal
pro Tag erneuert. Gelesen wird sie mit dem GDAL-OSM-Treiber (über pyogrio, kein Zusatzpaket).

Daten © OpenStreetMap-Mitwirkende, ODbL.
"""
from __future__ import annotations

import logging
import re
import time
import urllib.request
from datetime import date
from pathlib import Path

import pandas as pd
import pyogrio

from .cache import CACHE_DIR, DAY

log = logging.getLogger(__name__)

URL = "https://download.geofabrik.de/europe/germany/baden-wuerttemberg/karlsruhe-regbez-latest.osm.pbf"
PATH = CACHE_DIR / "geofabrik" / "karlsruhe-regbez-latest.osm.pbf"
MAX_AGE_S = DAY
USER_AGENT = "pv-prognose-pforzheim/0.4 (Studienprojekt)"

_SOLAR = "other_tags LIKE '%\"generator:source\"=>\"solar\"%'"
_HSTORE = re.compile(r'"((?:[^"\\]|\\.)*)"=>"((?:[^"\\]|\\.)*)"')
_NO_TAG_COLUMNS = {"osm_id", "osm_way_id", "other_tags", "geometry"}

_memo: dict = {}


def pbf_path(force: bool = False) -> Path:
    """Lokaler Auszug; lädt neu, wenn er fehlt oder älter als einen Tag ist."""
    fresh = PATH.exists() and time.time() - PATH.stat().st_mtime < MAX_AGE_S
    if fresh and not force:
        return PATH
    PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = PATH.with_suffix(".tmp")
    log.info("Lade Geofabrik-Auszug %s …", URL)
    try:
        req = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.replace(PATH)
        _memo.clear()
    except Exception:  # noqa: BLE001
        tmp.unlink(missing_ok=True)
        if PATH.exists():
            log.exception("Download fehlgeschlagen – verwende vorhandenen Auszug")
            return PATH
        raise
    return PATH


def data_date() -> str:
    """Stand des Auszugs (Dateidatum)."""
    return date.fromtimestamp(pbf_path().stat().st_mtime).isoformat()


def _tags(row: pd.Series) -> dict:
    tags = {k: v for k, v in row.items()
            if k not in _NO_TAG_COLUMNS and isinstance(v, str) and v}
    if isinstance(row.get("other_tags"), str):
        tags.update((k.replace('\\"', '"'), v.replace('\\"', '"')) for k, v in _HSTORE.findall(row["other_tags"]))
    return tags


def _osm_id(row: pd.Series, layer: str) -> str:
    if layer == "points":
        return f"n{row['osm_id']}"
    if isinstance(row.get("osm_way_id"), str):
        return f"w{row['osm_way_id']}"
    return f"r{row['osm_id']}"


def _read(area, layer: str, where: str) -> list[tuple[str, dict, object]]:
    """Objekte eines Layers, die das Gebiet schneiden: [(osm_id, tags, shapely-Geometrie)]."""
    key = (layer, where, area.wkb)
    if key not in _memo:
        df = pyogrio.read_dataframe(pbf_path(), layer=layer, bbox=area.bounds, where=where)
        df = df[df.geometry.notna() & df.geometry.intersects(area)]
        _memo[key] = [(_osm_id(r, layer), _tags(r), r.geometry) for _, r in df.iterrows()]
    return _memo[key]


def buildings(area) -> list[tuple[str, dict, object]]:
    return [f for f in _read(area, "multipolygons", f"building IS NOT NULL OR {_SOLAR}") if "building" in f[1]]


def solar(area) -> list[tuple[str, dict, object]]:
    polys = [f for f in _read(area, "multipolygons", f"building IS NOT NULL OR {_SOLAR}")
             if f[1].get("generator:source") == "solar"]
    return _read(area, "points", _SOLAR) + polys
