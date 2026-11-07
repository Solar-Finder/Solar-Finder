from pathlib import Path

import geopandas as gpd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

datei = Path(
    "DataAnalytics/8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt/"
    "8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt.shp"
)

daten = gpd.read_file(datei)


@app.get("/api/solar")
def solar_daten(limit: int = 100):
    spalten = [
        "BuildingID",
        "RoofID",
        "RoofType",
        "Power",
        "Eignung",
        "Area",
        "PvArea",
        "ErtKwP_K",
        "ErtKwhaK",
        "CO2Savings",
        "Yield",
    ]

    ergebnis = daten[spalten].head(limit)

    # NaN-Werte für JSON in null umwandeln
    ergebnis = ergebnis.where(ergebnis.notna(), None)

    return ergebnis.to_dict(orient="records")


@app.get("/api/solar/statistik")
def solar_statistik():
    return {
        "anzahl_dachflaechen": int(len(daten)),
        "gesamte_pv_flaeche": float(daten["PvArea"].sum()),
        "durchschnittliche_pv_flaeche": float(daten["PvArea"].mean()),
        "median_pv_flaeche": float(daten["PvArea"].median()),
        "gesamte_leistung": float(daten["Power"].sum()),
        "gesamtertrag_kwh": float(daten["ErtKwhaK"].sum()),
    }