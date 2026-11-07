"""FastAPI-Backend: liefert Daten im Format von docs/api/openapi.yaml.

Start:  uvicorn app.main:app --reload --port 8000   (im Ordner backend/)
Doku:   http://localhost:8000/docs

Das Frontend (Next.js) leitet /api/* per Rewrite hierher weiter.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from . import data_service as ds
from .schemas import (
    BuildingCategory,
    BuildingCollection,
    Breakdown,
    ForecastRequest,
    ForecastResponse,
    InstallationCollection,
    Meta,
    PostalAreaCollection,
    Status,
    SuitabilityClass,
)

app = FastAPI(title="PV-Prognose Pforzheim", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api/v1")

CategoryQ = Query(None, description="Gebäudekategorie(n), mehrfach erlaubt")
SuitabilityQ = Query(None, description="Eignungsklasse(n) 1, 2, 3, 6 – mehrfach erlaubt")


@api.get("/meta", response_model=Meta, tags=["status"])
def get_meta():
    return ds.meta()


@api.get("/status", response_model=Status, tags=["status"])
def get_status(postal_code: Optional[str] = None):
    return ds.status(postal_code)


@api.get("/map/installations", response_model=InstallationCollection, tags=["map"])
def get_installations(
    bbox: Optional[str] = None,
    postal_code: Optional[str] = None,
    category: Optional[list[BuildingCategory]] = CategoryQ,
    max_power_kwp: float = 30,
):
    return ds.installations(bbox, postal_code, category, max_power_kwp)


@api.get("/map/buildings", response_model=BuildingCollection, tags=["map"])
def get_buildings(
    bbox: Optional[str] = None,
    postal_code: Optional[str] = None,
    category: Optional[list[BuildingCategory]] = CategoryQ,
    suitability: Optional[list[SuitabilityClass]] = SuitabilityQ,
    only_free_potential: bool = False,
):
    return ds.buildings(bbox, postal_code, category, suitability, only_free_potential)


@api.get("/map/postal-areas", response_model=PostalAreaCollection, tags=["map"])
def get_postal_areas(postal_code: Optional[str] = None):
    return ds.postal_areas(postal_code)


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


@api.post("/forecast", response_model=ForecastResponse, tags=["forecast"])
def post_forecast(req: ForecastRequest):
    return ds.forecast(req)


app.include_router(api)
