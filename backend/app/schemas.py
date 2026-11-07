"""API-Schemas (Pydantic v2). Muss synchron zu docs/api/openapi.json bleiben."""
from __future__ import annotations

from datetime import date
from enum import Enum, IntEnum
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class BuildingCategory(str, Enum):
    residential = "residential"    # Wohngebäude
    public = "public"              # Öffentliche Gebäude
    commercial = "commercial"      # Gewerbe & Industrie
    agricultural = "agricultural"  # Landwirtschaft
    other = "other"                # Sonstige / in OSM nicht klassifiziert


class SuitabilityClass(IntEnum):
    """Eignungsklassen laut LUBW-Dachflächenpotenzial (Daten folgen)."""
    k1 = 1
    k2 = 2
    k3 = 3
    k6 = 6


class RoofType(str, Enum):
    gable = "gable"  # Satteldach
    flat = "flat"    # Flachdach
    shed = "shed"    # Pultdach
    other = "other"  # Sonstige


class SolarStatus(str, Enum):
    existing = "existing"    # Solaranlage bekannt (MaStR > 30 kW mit Koordinaten oder OSM)
    potential = "potential"  # keine bekannte Anlage, nennenswertes Dachpotenzial
    none = "none"            # Nebengebäude / zu klein


class DataStatus(str, Enum):
    verified = "verified"    # amtliche bzw. registrierte Daten
    estimated = "estimated"  # Schätzung (z. B. Potenzial aus Grundfläche)
    example = "example"      # Beispiel-/Modellwert
    pending = "pending"      # Datenquelle noch nicht angebunden


# ---------- Meta ----------
class LabeledOption(BaseModel):
    value: str | int
    label: str


class Range(BaseModel):
    min: float
    max: float
    step: float
    default: float


class Sliders(BaseModel):
    target_utilization_pct: Range  # min = aktuell genutztes Potenzial
    horizon_years: Range
    electricity_price_ct_per_kwh: Range


class ElectricityPrice(BaseModel):
    value_ct_per_kwh: float
    source: str
    is_example: bool = True


class DataSource(BaseModel):
    name: str
    url: str
    retrieved_at: Optional[date] = None
    note: Optional[str] = None


class Meta(BaseModel):
    installed_status: DataStatus
    potential_status: DataStatus
    suitability_status: DataStatus
    categories: list[LabeledOption]
    suitability_classes: list[LabeledOption]
    roof_types: list[LabeledOption]
    pv_views: list[LabeledOption]
    postal_codes: list[LabeledOption]
    sliders: Sliders
    electricity_price: ElectricityPrice
    sources: list[DataSource]
    data_as_of: date


# ---------- Status ----------
class Status(BaseModel):
    installed_power_mwp: float
    potential_power_mwp: float
    utilization_pct: float
    installation_count: int          # alle registrierten Anlagen
    located_installation_count: int  # davon mit Koordinaten (> 30 kW)
    balcony_count: int               # davon Balkonkraftwerke
    installed_status: DataStatus
    potential_status: DataStatus
    source: str
    data_as_of: date


# ---------- GeoJSON ----------
class PointGeometry(BaseModel):
    type: Literal["Point"] = "Point"
    coordinates: tuple[float, float]  # (lon, lat)


class PolygonGeometry(BaseModel):
    type: Literal["Polygon", "MultiPolygon"]
    coordinates: list[Any]


class InstallationProps(BaseModel):
    power_kwp: float
    commissioned_on: Optional[date] = None
    postal_code: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    plant_type: Optional[str] = None
    building_use: Optional[str] = None
    building_id: Optional[str] = None


class InstallationFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str  # MaStR-Nummer
    geometry: PointGeometry
    properties: InstallationProps


class InstallationCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[InstallationFeature]
    unlocated_count: int = 0  # Anlagen im Filterbereich ohne öffentliche Koordinaten


class BuildingProps(BaseModel):
    category: BuildingCategory
    building_type: str
    name: Optional[str] = None
    footprint_m2: float
    solar_status: SolarStatus
    installed_kwp: float = 0.0          # Summe der zugeordneten MaStR-Anlagen
    solar_sources: list[str] = []       # "mastr", "osm"
    potential_kwp: float                # Dachpotenzial (Schätzung bis LUBW)
    potential_status: DataStatus
    suitability: Optional[SuitabilityClass] = None  # folgt mit LUBW-Daten
    roof_type: Optional[RoofType] = None            # folgt mit LUBW-Daten
    postal_code: Optional[str] = None


class BuildingFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str  # OSM-ID (w…/r…)
    geometry: PolygonGeometry
    properties: BuildingProps


class BuildingCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[BuildingFeature]
    truncated: bool = False  # mehr Treffer als `limit`


class PostalAreaProps(BaseModel):
    postal_code: str
    name: Optional[str] = None
    installed_power_mwp: float
    potential_power_mwp: float
    utilization_pct: float
    installation_count: int
    located_installation_count: int
    balcony_count: int
    buildings_with_solar: int
    buildings_with_potential: int
    label_point: Optional[tuple[float, float]] = None  # (lon, lat)


class PostalAreaFeature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str
    geometry: PolygonGeometry
    properties: PostalAreaProps


class PostalAreaCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[PostalAreaFeature]
    potential_status: DataStatus


# ---------- Diagramme ----------
class BreakdownItem(BaseModel):
    key: str
    label: str
    building_count: int
    potential_kwp: float
    share_pct: float  # Anteil nach Anzahl


class Breakdown(BaseModel):
    basis: Literal["count"] = "count"
    data_status: DataStatus
    note: Optional[str] = None
    items: list[BreakdownItem]


# ---------- Prognose ----------
class ForecastRequest(BaseModel):
    target_utilization_pct: float = Field(ge=0, le=100)
    horizon_years: int = Field(ge=1, le=30)
    electricity_price_ct_per_kwh: float = Field(ge=0, le=200)


class ForecastYear(BaseModel):
    year_index: int  # 0 = Start
    year: int
    cumulative_balance_eur: float  # < 0 bis Amortisation


class ForecastAssumptions(BaseModel):
    investment_eur_per_kwp: float
    specific_yield_kwh_per_kwp: float
    operating_cost_pct_of_investment: float
    co2_kg_per_kwh: float


class ForecastResponse(BaseModel):
    data_status: DataStatus  # Modellannahmen sind Beispielwerte
    existing_power_mwp: float
    potential_power_mwp: float
    target_power_mwp: float
    new_power_mwp: float
    investment_eur: float
    profit_eur: float
    electricity_value_eur_per_year: float
    operating_cost_eur_per_year: float
    amortization_years: Optional[float]
    energy_per_year_mwh: float
    energy_total_mwh: float
    consumption_gwh_per_year: float
    solar_share_pct: float
    co2_savings_t_per_year: float
    co2_savings_t_total: float
    assumptions: ForecastAssumptions
    timeline: list[ForecastYear]
