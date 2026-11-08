"""FastAPI-Backend: liefert Daten im Format von docs/api/openapi.json.

Start:  uvicorn app.main:app --reload --reload-dir app --timeout-keep-alive 75 --port 8000   (im Ordner backend/)
        --timeout-keep-alive muss länger sein als die Leerlaufzeit des Next.js-Proxys,
        sonst schließt uvicorn (Standard 5 s) Verbindungen, die der Proxy gerade wiederverwendet
        → ECONNRESET / „Kartendaten konnten nicht geladen werden“.
Doku:   http://localhost:8000/docs

Beim ersten Start werden die MaStR-Daten geladen und in data/cache abgelegt; danach kommen sie
aus dem Cache. LUBW- und OSM-Daten liegen im Repository (data/), OSM wird nach Ablauf im
Hintergrund aktualisiert.
Neu laden:  python -m app.refresh [mastr|osm]
"""
from __future__ import annotations

import threading
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Path, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from . import data_service as ds
from .geo_model import get_model
from .sources import tiles
from .schemas import (
    BuildingCategory,
    BuildingCollection,
    BuildingPoints,
    Breakdown,
    ForecastRequest,
    ForecastResponse,
    InstallationCollection,
    Meta,
    PostalAreaCollection,
    SolarStatus,
    Status,
    SuitabilityClass,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Datenmodell im Hintergrund vorbereiten, damit der erste Request schnell ist
    threading.Thread(target=get_model, daemon=True).start()
    yield


API_DESCRIPTION = """
Vertrag zwischen Python-Backend (FastAPI) und JavaScript-Frontend (Next.js).

**Datenquellen**
- PV-Anlagen: Marktstammdatenregister (alle Einheiten „In Betrieb“, Gemeinde Pforzheim).
  Koordinaten/Adresse sind nur bei Anlagen > 30 kW öffentlich; kleinere Anlagen nur je PLZ.
- Zusätzlich erfasste Dachanlagen: OpenStreetMap (© OSM-Mitwirkende, ODbL).
- Gebäude & Dachpotenzial: LUBW Solarpotenzial Dachflächen (Shapefile, Klassen 1–3), siehe docs/datenmodell.md.
- PLZ-Grenzen und Gebäudeart: OpenStreetMap (optional).

**Konventionen**
- Einheiten im Feldnamen (`_mwp`, `_kwp`, `_pct`, `_eur`, `_ct_per_kwh`, `_mwh`, `_t`, `_m2`).
- GeoJSON in WGS84 (EPSG:4326), Koordinaten `[lon, lat]`.
- Mehrfach-Filter als wiederholte Query-Parameter (`?category=public&category=commercial`).

Diese Datei wird erzeugt mit `python -m app.export_openapi` (im Ordner `backend/`).
"""

app = FastAPI(title="PV-Prognose Pforzheim", version="0.4.0", description=API_DESCRIPTION, lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2000)  # Gebäude-/Punktlisten sind groß
app.add_middleware(
    CORSMiddleware,
    # Das Frontend ruft das Backend direkt aus dem Browser auf
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")

CategoryQ = Query(None, description="Gebäudekategorie(n), mehrfach erlaubt")
SuitabilityQ = Query(None, description="Eignungsklasse(n) laut LUBW: 1, 2, 3 (PV-geeignet), 6, 8, 0")


@api.get("/meta", response_model=Meta, tags=["status"])
def get_meta():
    return ds.meta()


@api.get("/status", response_model=Status, tags=["status"])
def get_status(postal_code: Optional[str] = None):
    return ds.status(postal_code)


@api.get("/map/postal-areas", response_model=PostalAreaCollection, tags=["map"])
def get_postal_areas(postal_code: Optional[str] = None):
    return ds.postal_areas(postal_code)


@api.get("/map/buildings", response_model=BuildingCollection, tags=["map"])
def get_buildings(
    bbox: Optional[str] = Query(None, description="minLon,minLat,maxLon,maxLat – empfohlen, sonst sehr viele Gebäude"),
    postal_code: Optional[str] = None,
    category: Optional[list[BuildingCategory]] = CategoryQ,
    solar_status: Optional[list[SolarStatus]] = Query(None, description="existing, potential, none"),
    limit: int = Query(ds.MAX_BUILDINGS, ge=1, le=ds.MAX_BUILDINGS),
):
    return ds.buildings(bbox, postal_code, category, solar_status, limit)


@api.get("/map/building-points", response_model=BuildingPoints, tags=["map"])
def get_building_points(
    postal_code: Optional[str] = None,
    category: Optional[list[BuildingCategory]] = CategoryQ,
    solar_status: Optional[list[SolarStatus]] = Query(None, description="existing, potential, none (Standard: alle)"),
):
    """Alle Gebäude als Punkte – für die Übersicht bei kleinem Maßstab (ohne Grundrisse)."""
    return ds.building_points(postal_code, category, solar_status)


@api.get("/map/installations", response_model=InstallationCollection, tags=["map"])
def get_installations(
    bbox: Optional[str] = None,
    postal_code: Optional[str] = None,
    max_power_kwp: Optional[float] = None,
    category: Optional[list[BuildingCategory]] = CategoryQ,
):
    """Verortete MaStR-Anlagen. Mit `category` nur Anlagen auf Gebäuden dieser Kategorie(n)."""
    return ds.installations(bbox, postal_code, max_power_kwp, category)


def _stats_route(path: str, fn):
    @api.get(path, response_model=Breakdown, tags=["stats"])
    def route(
        postal_code: Optional[str] = None,
        category: Optional[list[BuildingCategory]] = CategoryQ,
        suitability: Optional[list[SuitabilityClass]] = SuitabilityQ,
    ):
        return fn(postal_code, category, suitability)

    route.__name__ = "get_" + path.strip("/").replace("/", "_").replace("-", "_")
    return route


_stats_route("/stats/roof-types", ds.roof_types)
_stats_route("/stats/building-categories", ds.building_categories)
_stats_route("/stats/suitability-classes", ds.suitability_classes)


@api.get("/tiles/{basemap}/{z}/{x}/{y}", tags=["map"], response_class=Response,
         responses={200: {"content": {"image/png": {}, "image/jpeg": {}}}})
def get_tile(
    basemap: Literal["standard", "aerial"],
    z: int = Path(ge=0, le=tiles.MAX_ZOOM),
    x: int = Path(ge=0),
    y: int = Path(ge=0),
):
    """Kartenkachel über das Backend (standard = OpenStreetMap, aerial = Esri World Imagery).

    Datenschutz: Der Browser spricht die Kachelserver nicht direkt an; diese sehen nur das Backend.
    """
    try:
        data, content_type = tiles.get_tile(basemap, z, x, y)
    except tiles.TileNotFound:
        raise HTTPException(404, "Kachel nicht vorhanden")
    except Exception:  # noqa: BLE001
        raise HTTPException(502, "Kachelserver nicht erreichbar")
    return Response(data, media_type=content_type, headers={"Cache-Control": "public, max-age=86400"})


@api.post("/forecast", response_model=ForecastResponse, tags=["forecast"])
def post_forecast(req: ForecastRequest):
    return ds.forecast(req)


app.include_router(api)
