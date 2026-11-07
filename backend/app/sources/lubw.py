"""Lokale LUBW-Dachflächenpotenziale aus dem Shapefile."""
from __future__ import annotations

import os
from datetime import date
from pathlib import Path

import geopandas as gpd

DATA_DIR = Path(__file__).resolve().parents[3] / "data" / "8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt"
FILENAME = "8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt.shp"
REQUIRED_COLUMNS = {
    "BuildingID", "RoofID", "Eignung", "RoofType", "PvArea",
    "Power", "ErtKwP_K", "ErtKwhaK", "geometry",
}


def _path() -> Path:
    configured = os.environ.get("PV_POTENTIAL_PATH")
    if configured:
        path = Path(configured)
    else:
        path = DATA_DIR / FILENAME
    if not path.is_file():
        raise FileNotFoundError(
            f"PV-Potenzialdatei nicht gefunden: {path}. "
            "Setze PV_POTENTIAL_PATH auf die .shp-Datei."
        )
    return path


def load() -> dict:
    """Lädt die Dachseiten und bringt sie in WGS84 für die räumliche Zuordnung."""
    data = gpd.read_file(_path())
    missing = REQUIRED_COLUMNS - set(data.columns)
    if missing:
        raise ValueError(f"Fehlende Spalten im PV-Shapefile: {sorted(missing)}")
    if data.crs is None:
        raise ValueError("Das PV-Shapefile enthält kein Koordinatensystem.")
    data = data.to_crs("EPSG:4326")
    data = data[data.geometry.notna() & ~data.geometry.is_empty].reset_index(drop=True)
    return {
        "retrieved_at": date.today().isoformat(),
        "roofs": data.to_dict("records"),
    }
