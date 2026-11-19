"""LUBW Solarpotenzial auf Dachflächen (lokales Shapefile, eine Zeile je Dachseite).

Herkunft laut Datensatz: „LUBW, Geoplex GIS GmbH“, Jahr 2025, EPSG:25832.
Spaltenbedeutung und die im Datensatz nachgeprüften Zusammenhänge: docs/datenmodell.md.

Ergebnis von `load()`: ein Datensatz je Gebäude (`BuildingID`) mit
- Umriss = Vereinigung aller Dachseiten (WGS84),
- Potenzial = Summen von Power / Yield / CO2Savings über die PV-geeigneten Dachseiten (Klasse 1–3),
- bester Eignungsklasse und Dachform.
"""
from __future__ import annotations

import logging
import os
from datetime import date
from pathlib import Path

import geopandas as gpd
import pandas as pd

from .cache import DATA_DIR as _DATA_ROOT

log = logging.getLogger(__name__)

DATA_DIR = _DATA_ROOT / "8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt"
FILENAME = "8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt.shp"

COLUMNS = ["BuildingID", "Eignung", "RoofType", "Power", "Yield", "CO2Savings", "Area3D", "PvArea", "JAHR", "HERKUNFT"]

# Klassen mit PV-Belegungsfläche (PvArea > 0, Yield > 0, CO2Savings > 0 im Datensatz).
# Klasse 6: keine Belegungsfläche – Power/Yield sind dort aus PvAreaT gerechnet und zählen NICHT.
# Klasse 8: keine Berechnung (Slope = -1, alle Werte 0). Klasse 0: Dachtyp unbekannt, alle Werte 0.
SUITABLE_CLASSES = (1, 2, 3)
CLASS_RANK = (1, 2, 3, 6, 8, 0)  # „beste“ Klasse eines Gebäudes = erste vorkommende in dieser Reihenfolge

ROOF_TYPE_MAP = {"Flachdach": "flat", "Spitzdach": "pitched", "Unbekannt": "unknown"}


def path() -> Path:
    configured = os.environ.get("PV_POTENTIAL_PATH")
    p = Path(configured) if configured else DATA_DIR / FILENAME
    if not p.is_file():
        raise FileNotFoundError(
            f"LUBW-Shapefile nicht gefunden: {p}. Setze PV_POTENTIAL_PATH auf die .shp-Datei."
        )
    return p


def _best_class(values: pd.Series) -> int:
    present = set(int(v) for v in values)
    return next(c for c in CLASS_RANK if c in present) if present & set(CLASS_RANK) else int(min(present))


def _roof_type(values: pd.Series) -> str:
    kinds = {ROOF_TYPE_MAP.get(v, "unknown") for v in values} - {"unknown"}
    if not kinds:
        return "unknown"
    return "mixed" if len(kinds) > 1 else kinds.pop()


def load() -> dict:
    p = path()
    faces = gpd.read_file(p, columns=COLUMNS)
    missing = set(COLUMNS) - set(faces.columns)
    if missing:
        raise ValueError(f"Fehlende Spalten im LUBW-Shapefile: {sorted(missing)}")
    if faces.crs is None:
        raise ValueError("Das LUBW-Shapefile enthält kein Koordinatensystem.")
    faces = faces[faces.geometry.notna() & ~faces.geometry.is_empty].copy()
    # ~2 000 Dachseiten sind topologisch ungültig → reparieren, sonst scheitert die Vereinigung
    faces["geometry"] = faces.geometry.make_valid().buffer(0)

    suitable = faces["Eignung"].isin(SUITABLE_CLASSES)
    for col in ("Power", "Yield", "CO2Savings", "PvArea"):
        faces[f"s_{col}"] = faces[col].where(suitable, 0.0)
    faces["s_face"] = suitable.astype(int)

    grouped = faces.groupby("BuildingID")
    attrs = pd.DataFrame({
        "potential_kwp": grouped["s_Power"].sum(),
        "potential_kwh_per_year": grouped["s_Yield"].sum(),
        "co2_savings_kg_per_year": grouped["s_CO2Savings"].sum(),
        # Area3D = Area ÷ cos(Slope) für alle Dachseiten → tatsächliche (geneigte) Dachfläche
        "roof_area_m2": grouped["Area3D"].sum(),
        "pv_area_m2": grouped["s_PvArea"].sum(),           # PV-Belegungsfläche, Klassen 1–3
        "roof_faces": grouped.size(),
        "suitable_roof_faces": grouped["s_face"].sum(),
        "suitability": grouped["Eignung"].agg(_best_class),
        "roof_type": grouped["RoofType"].agg(_roof_type),
    })
    outlines = faces[["BuildingID", "geometry"]].dissolve("BuildingID", grid_size=0.01)
    footprint = outlines.geometry.area                        # m², da EPSG:25832
    wgs = outlines.to_crs("EPSG:4326")
    centers = wgs.geometry.representative_point()

    buildings = []
    for bid, row in attrs.iterrows():
        buildings.append({
            "id": f"L{int(bid)}",
            "lubw_building_id": int(bid),
            "geometry": wgs.geometry.loc[bid],
            "center": (round(centers.loc[bid].x, 6), round(centers.loc[bid].y, 6)),
            "footprint_m2": round(float(footprint.loc[bid]), 1),
            "potential_kwp": float(row.potential_kwp),
            "potential_kwh_per_year": float(row.potential_kwh_per_year),
            "co2_savings_kg_per_year": float(row.co2_savings_kg_per_year),
            "roof_area_m2": round(float(row.roof_area_m2), 1),
            "pv_area_m2": round(float(row.pv_area_m2), 1),
            "roof_faces": int(row.roof_faces),
            "suitable_roof_faces": int(row.suitable_roof_faces),
            "suitability": int(row.suitability),
            "roof_type": row.roof_type,
        })

    s = faces[suitable]
    totals = {
        "roof_faces": int(len(faces)),
        "buildings": len(buildings),
        "potential_kwp": float(s["Power"].sum()),
        "potential_kwh_per_year": float(s["Yield"].sum()),
        "co2_savings_kg_per_year": float(s["CO2Savings"].sum()),
    }
    totals["specific_yield_kwh_per_kwp"] = totals["potential_kwh_per_year"] / totals["potential_kwp"]
    totals["co2_kg_per_kwh"] = totals["co2_savings_kg_per_year"] / totals["potential_kwh_per_year"]
    log.info("LUBW: %d Dachseiten, %d Gebäude, %.1f MWp geeignet", totals["roof_faces"],
             totals["buildings"], totals["potential_kwp"] / 1000)

    years = sorted(faces["JAHR"].dropna().astype(int).unique().tolist())
    return {
        "loaded_at": date.today().isoformat(),
        "data_year": years[-1] if years else None,
        "origin": ", ".join(sorted(faces["HERKUNFT"].dropna().unique())),
        "buildings": buildings,
        "totals": totals,
    }
