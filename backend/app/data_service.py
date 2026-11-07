"""Datenschicht.

Echte Daten:
- Installierte Anlagen: Marktstammdatenregister (alle PV-Einheiten in Betrieb, Pforzheim)
- PLZ-Grenzen und Gebäudegrundrisse: OpenStreetMap
- Gebäude mit Anlage: MaStR-Anlagen > 30 kW (Koordinaten) + in OSM erfasste Dachanlagen

Noch Schätzung / Beispiel:
- Dachpotenzial je Gebäude: LUBW-Dachseiten, mit OSM-Schätzung als Fallback
- Wirtschaftlichkeit (Investition, Ertrag, CO₂, Stromverbrauch, Strompreis): Modellannahmen
"""
from __future__ import annotations

from datetime import date
from typing import Iterable, Optional

from shapely.geometry import Point, box

from .geo_model import POTENTIAL_SOURCE, get_model
from .schemas import (
    DataStatus,
    ForecastAssumptions,
    ForecastRequest,
    ForecastResponse,
    ForecastYear,
)

POTENTIAL_STATUS = DataStatus.verified if POTENTIAL_SOURCE == "lubw" else DataStatus.estimated
SUITABILITY_STATUS = DataStatus.verified if POTENTIAL_SOURCE == "lubw" else DataStatus.pending

# ---- Modellannahmen (Beispielwerte aus dem Mockup) ----
INVESTMENT_EUR_PER_KWP = 900.0
SPECIFIC_YIELD_KWH_PER_KWP = 1000.0
OPERATING_COST_PCT = 1.5
CO2_KG_PER_KWH = 0.35
CONSUMPTION_GWH_PER_YEAR = 300.0
ELECTRICITY_PRICE_CT = 18.0

MAX_BUILDINGS = 8000

CATEGORY_LABELS = {
    "residential": "Wohngebäude",
    "public": "Öffentliche Gebäude",
    "commercial": "Gewerbe & Industrie",
    "agricultural": "Landwirtschaft",
    "other": "Sonstige / nicht klassifiziert",
}
SUITABILITY_LABELS = {1: "Klasse 1", 2: "Klasse 2", 3: "Klasse 3", 6: "Klasse 6"}
ROOF_LABELS = {"gable": "Satteldach", "flat": "Flachdach", "shed": "Pultdach", "other": "Sonstige"}
PV_VIEW_LABELS = {"potential": "Potenzial", "existing": "Bestand"}


def _opts(d: dict):
    return [{"value": k, "label": v} for k, v in d.items()]


def _iso(d: str) -> date:
    return date.fromisoformat(d)


def _totals(postal_code: Optional[str] = None):
    """Installierte Leistung (MaStR) und Potenzial (Gebäude) in kWp."""
    m = get_model()
    units = [u for u in m.units if not postal_code or u["postal_code"] == postal_code]
    installed = sum(u["power_kwp"] for u in units)
    potential = sum(b.potential_kwp for b in m.buildings if b.postal_code and (not postal_code or b.postal_code == postal_code))
    return installed, potential, units


def _specific_yield(postal_code: Optional[str] = None) -> float:
    m = get_model()
    buildings = [
        b for b in m.buildings
        if b.postal_code and (not postal_code or b.postal_code == postal_code)
        and b.potential_kwp > 0
    ]
    capacity = sum(b.potential_kwp for b in buildings)
    annual_energy = sum(b.potential_kwh_per_year for b in buildings)
    return annual_energy / capacity if capacity else SPECIFIC_YIELD_KWH_PER_KWP


# ================= öffentliche Funktionen =================

def meta():
    m = get_model()
    inst, pot, _ = _totals()
    current = int(inst / pot * 100) if pot else 0
    return {
        "installed_status": DataStatus.verified,
        "potential_status": POTENTIAL_STATUS,
        "suitability_status": SUITABILITY_STATUS,
        "categories": _opts(CATEGORY_LABELS),
        "suitability_classes": _opts(SUITABILITY_LABELS),
        "roof_types": _opts(ROOF_LABELS),
        "pv_views": _opts(PV_VIEW_LABELS),
        "postal_codes": [{"value": a["postal_code"], "label": a["name"]} for a in m.areas],
        "sliders": {
            "target_utilization_pct": {"min": current, "max": 100, "step": 1, "default": max(current, 30)},
            "horizon_years": {"min": 5, "max": 30, "step": 1, "default": 20},
            "electricity_price_ct_per_kwh": {"min": 10, "max": 50, "step": 1, "default": ELECTRICITY_PRICE_CT},
        },
        "electricity_price": {"value_ct_per_kwh": ELECTRICITY_PRICE_CT, "source": "Beispielwert", "is_example": True},
        "sources": [
            {"name": "Marktstammdatenregister", "url": "https://www.marktstammdatenregister.de",
             "retrieved_at": _iso(m.retrieved["mastr"]), "note": "PV-Anlagen in Betrieb; Koordinaten nur > 30 kW"},
            {"name": "OpenStreetMap (PLZ-Grenzen, Gebäude)", "url": "https://www.openstreetmap.org/copyright",
             "retrieved_at": _iso(m.retrieved["osm_buildings"]), "note": "© OpenStreetMap-Mitwirkende, ODbL"},
            {"name": "LUBW Dachflächenpotenzial",
             "url": "https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html",
             "retrieved_at": _iso(m.retrieved["lubw_roofs"]),
             "note": "Lokale Dachseiten-Shapefile; OSM-Schätzung nur ohne räumliche Zuordnung"},
        ],
        "data_as_of": _iso(m.retrieved["mastr"]),
    }


def status(postal_code: Optional[str] = None):
    m = get_model()
    inst, pot, units = _totals(postal_code)
    return {
        "installed_power_mwp": round(inst / 1000, 1),
        "potential_power_mwp": round(pot / 1000, 1),
        "utilization_pct": round(inst / pot * 100, 1) if pot else 0.0,
        "installation_count": len(units),
        "located_installation_count": sum(1 for u in units if u.get("lat")),
        "balcony_count": sum(1 for u in units if "Balkon" in (u.get("plant_type") or "")),
        "installed_status": DataStatus.verified,
        "potential_status": POTENTIAL_STATUS,
        "source": "MaStR · LUBW-Dachseiten (OSM-Fallback)",
        "data_as_of": _iso(m.retrieved["mastr"]),
    }


def postal_areas(postal_code=None):
    m = get_model()
    feats = []
    for a in m.areas:
        if postal_code and a["postal_code"] != postal_code:
            continue
        st = m.plz_stats.get(a["postal_code"], {})
        inst, pot = st.get("installed_kwp", 0.0), st.get("potential_kwp", 0.0)
        lp = a["geom"].representative_point()
        feats.append({
            "type": "Feature", "id": a["postal_code"], "geometry": a["geometry"],
            "properties": {
                "postal_code": a["postal_code"], "name": a["name"],
                "installed_power_mwp": round(inst / 1000, 2), "potential_power_mwp": round(pot / 1000, 2),
                "utilization_pct": round(inst / pot * 100, 1) if pot else 0.0,
                "installation_count": st.get("units", 0), "located_installation_count": st.get("located", 0),
                "balcony_count": st.get("balcony", 0),
                "buildings_with_solar": st.get("buildings_with_solar", 0),
                "buildings_with_potential": st.get("buildings_potential", 0),
                "label_point": (round(lp.x, 6), round(lp.y, 6)),
            },
        })
    return {"type": "FeatureCollection", "features": feats, "potential_status": POTENTIAL_STATUS}


def _bbox(bbox: Optional[str]):
    if not bbox:
        return None
    x0, y0, x1, y1 = (float(v) for v in bbox.split(","))
    return box(x0, y0, x1, y1)


def _filtered_buildings(postal_code=None, category=None, bbox=None, suitability=None):
    m = get_model()
    if bbox is not None:
        cand = (m.buildings[i] for i in m.tree.query(bbox, predicate="intersects"))
    else:
        cand = iter(m.buildings)
    for b in cand:
        if not b.postal_code or (postal_code and b.postal_code != postal_code):
            continue
        if category and b.category not in category:
            continue
        if suitability and b.suitability not in suitability:
            continue
        yield b


def buildings(bbox=None, postal_code=None, category=None, solar_status=None, limit=MAX_BUILDINGS):
    feats, truncated = [], False
    for b in _filtered_buildings(postal_code, category, _bbox(bbox)):
        if solar_status and b.solar_status not in solar_status:
            continue
        if len(feats) >= limit:
            truncated = True
            break
        sources = (["mastr"] if b.mastr_ids else []) + (["osm"] if b.osm_solar else [])
        feats.append({
            "type": "Feature", "id": b.id, "geometry": b.geojson,
            "properties": {
                "category": b.category, "building_type": b.building_type, "name": b.name,
                "footprint_m2": b.footprint_m2, "solar_status": b.solar_status,
                "installed_kwp": round(b.installed_kwp, 1), "solar_sources": sources,
                "potential_kwp": b.potential_kwp, "potential_status": POTENTIAL_STATUS,
                "potential_kwh_per_year": b.potential_kwh_per_year,
                "suitability": b.suitability, "roof_type": b.roof_type,
                "postal_code": b.postal_code,
            },
        })
    return {"type": "FeatureCollection", "features": feats, "truncated": truncated}


def installations(bbox=None, postal_code=None, max_power_kwp: Optional[float] = None):
    m = get_model()
    area = _bbox(bbox)
    units = [u for u in m.units if not postal_code or u["postal_code"] == postal_code]
    feats = []
    for u in units:
        if not u.get("lat"):
            continue
        if area is not None and not area.contains(_pt(u)):
            continue
        if max_power_kwp is not None and u["power_kwp"] > max_power_kwp:
            continue
        b = m.by_id.get(u.get("building_id"))
        feats.append({
            "type": "Feature", "id": u["id"],
            # Geometrie = gemeldeter MaStR-Standort; building_point = Mitte des zugeordneten Gebäudes
            "geometry": {"type": "Point", "coordinates": (u["lon"], u["lat"])},
            "properties": {
                **{k: u.get(k) for k in ("power_kwp", "commissioned_on", "postal_code", "street",
                                         "house_number", "plant_type", "building_use", "building_id")},
                "building_point": b.center if b else None,
            },
        })
    return {"type": "FeatureCollection", "features": feats,
            "unlocated_count": sum(1 for u in units if not u.get("lat"))}


STATUS_CODE = {"existing": 1, "potential": 2, "none": 0}


def building_points(postal_code=None, category=None, solar_status=None):
    """Kompakte Punktliste aller Gebäude für die Übersicht bei kleinem Maßstab.

    Format: [[lon, lat, status], …] mit status 1 = Anlage vorhanden, 2 = ungenutztes Potenzial
    (Gebäude ohne nennenswertes Potenzial werden weggelassen).
    """
    wanted = set(solar_status or ["existing", "potential"])
    pts = [
        [b.center[0], b.center[1], STATUS_CODE[b.solar_status]]
        for b in _filtered_buildings(postal_code, category)
        if b.solar_status in wanted
    ]
    return {"status_codes": {"1": "existing", "2": "potential"}, "points": pts}


def _pt(u):
    return Point(u["lon"], u["lat"])


def _breakdown(rows: Iterable, key, labels: dict, status: DataStatus, note=None):
    rows = list(rows)
    total = len(rows) or 1
    items = []
    for k, label in labels.items():
        sel = [b for b in rows if key(b) == k]
        items.append({"key": str(k), "label": label, "building_count": len(sel),
                      "potential_kwp": round(sum(b.potential_kwp for b in sel), 1),
                      "share_pct": round(len(sel) / total * 100, 1)})
    return {"basis": "count", "data_status": status, "note": note, "items": items}


def building_categories(postal_code=None, category=None, suitability=None):
    rows = _filtered_buildings(postal_code, category, suitability=suitability)
    return _breakdown(rows, lambda b: b.category, CATEGORY_LABELS, DataStatus.verified,
                      note="Gebäudeart laut OpenStreetMap")


def roof_types(postal_code=None, category=None, suitability=None):
    rows = _filtered_buildings(postal_code, category, suitability=suitability)
    return _breakdown(rows, lambda b: b.roof_type or "other", ROOF_LABELS, SUITABILITY_STATUS)


def suitability_classes(postal_code=None, category=None, suitability=None):
    rows = _filtered_buildings(postal_code, category)
    return _breakdown(rows, lambda b: b.suitability, SUITABILITY_LABELS, SUITABILITY_STATUS)


def forecast(req: ForecastRequest) -> ForecastResponse:
    """Wirtschaftlichkeitsmodell für den ZUSÄTZLICHEN Ausbau (Modellannahmen = Beispielwerte).

    Bestand aus MaStR, Potenzial aus geo_model (Schätzung bis LUBW).
    Konstante Erträge und Preise, ohne Zinsen, Steuern und Degradation.
    """
    m = get_model()
    inst_kwp, pot_kwp, _ = _totals()
    existing, potential = inst_kwp / 1000, pot_kwp / 1000
    target = potential * req.target_utilization_pct / 100
    new_mwp = max(target - existing, 0.0)
    new_kwp = new_mwp * 1000

    investment = new_kwp * INVESTMENT_EUR_PER_KWP
    specific_yield = _specific_yield()
    energy_kwh = new_kwp * specific_yield
    value = energy_kwh * req.electricity_price_ct_per_kwh / 100
    opex = investment * OPERATING_COST_PCT / 100
    net = value - opex
    amortization = round(investment / net, 1) if net > 0 and investment > 0 else (0.0 if investment == 0 else None)
    co2_t = energy_kwh * CO2_KG_PER_KWH / 1000
    start_year = _iso(m.retrieved["mastr"]).year

    return ForecastResponse(
        data_status=DataStatus.example,
        existing_power_mwp=round(existing, 1),
        potential_power_mwp=round(potential, 1),
        target_power_mwp=round(target, 1),
        new_power_mwp=round(new_mwp, 1),
        investment_eur=round(investment),
        profit_eur=round(-investment + req.horizon_years * net),
        electricity_value_eur_per_year=round(value),
        operating_cost_eur_per_year=round(opex),
        amortization_years=amortization,
        energy_per_year_mwh=round(energy_kwh / 1000),
        energy_total_mwh=round(energy_kwh / 1000 * req.horizon_years),
        consumption_gwh_per_year=CONSUMPTION_GWH_PER_YEAR,
        solar_share_pct=round(energy_kwh / 1e6 / CONSUMPTION_GWH_PER_YEAR * 100, 1),
        co2_savings_t_per_year=round(co2_t),
        co2_savings_t_total=round(co2_t * req.horizon_years),
        assumptions=ForecastAssumptions(
            investment_eur_per_kwp=INVESTMENT_EUR_PER_KWP,
            specific_yield_kwh_per_kwp=round(specific_yield, 1),
            operating_cost_pct_of_investment=OPERATING_COST_PCT,
            co2_kg_per_kwh=CO2_KG_PER_KWH,
        ),
        timeline=[
            ForecastYear(year_index=t, year=start_year + t, cumulative_balance_eur=round(-investment + t * net))
            for t in range(req.horizon_years + 1)
        ],
    )
