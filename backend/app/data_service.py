"""Datenschicht – aktuell BEISPIELDATEN (Platzhalter).

Jede Funktion gibt exakt das Schema aus schemas.py zurück. Beim Anbinden der
echten Daten (MaStR, LUBW-Dachflächenpotenzial, amtliche PLZ-Geometrien,
Strompreis-API, pvlib) nur die Funktionsrümpfe ersetzen – Routen bleiben gleich.
"""
from __future__ import annotations

import random
from datetime import date
from functools import lru_cache
from typing import Iterable, Optional

from .schemas import (
    DataStatus,
    ForecastAssumptions,
    ForecastRequest,
    ForecastResponse,
    ForecastYear,
)

DATA_STATUS = DataStatus.example
DATA_AS_OF = date(2026, 11, 1)
SOURCE = "LUBW"

# ---- Modellannahmen (aus dem Mockup) ----
INVESTMENT_EUR_PER_KWP = 900.0
SPECIFIC_YIELD_KWH_PER_KWP = 1000.0
OPERATING_COST_PCT = 1.5
CO2_KG_PER_KWH = 0.35
CONSUMPTION_GWH_PER_YEAR = 300.0
ELECTRICITY_PRICE_CT = 18.0  # später aus Strompreis-API

CATEGORY_LABELS = {
    "residential": "Wohngebäude",
    "public": "Öffentliche Gebäude",
    "commercial": "Gewerbe & Industrie",
    "agricultural": "Landwirtschaft",
}
SUITABILITY_LABELS = {1: "Klasse 1", 2: "Klasse 2", 3: "Klasse 3", 6: "Klasse 6"}
ROOF_LABELS = {"gable": "Satteldach", "flat": "Flachdach", "shed": "Pultdach", "other": "Sonstige"}
PV_VIEW_LABELS = {"potential": "Potenzial", "existing": "Bestand"}

# ---- Beispiel-Geometrie: 6 PLZ-Gebiete als Raster um Pforzheim ----
# Gitterknoten (lon, lat); Nachbargebiete teilen sich Kanten.
_COLS = [8.615, 8.655, 8.700, 8.745, 8.785]
_ROWS = [48.925, 48.893, 48.858]
# (PLZ, Name, Spalten-Index von/bis, Zeile, Potenzial MWp, Auslastung %)
_AREAS = [
    ("75172", "Innenstadt",   0, 0, 0, 35.0, 24.0),
    ("75173", "Nordstadt",    1, 1, 0, 10.0, 42.0),
    ("75175", "Oststadt",     2, 3, 0, 5.0, 68.0),
    ("75177", "Weststadt",    0, 1, 1, 40.0, 22.0),
    ("75179", "Südweststadt", 2, 2, 1, 7.0, 39.0),
    ("75181", "Südoststadt",  3, 3, 1, 3.0, 81.0),
]
# Versatz je Zeile für die senkrechten Kanten (gemeinsame Kanten bleiben deckungsgleich)
_BEND = 0.004


def _area_polygon(c0: int, c1: int, r: int):
    """Spalten c0..c1 (inklusive) in Zeile r."""
    top, bottom = _ROWS[r], _ROWS[r + 1]
    left, right = _COLS[c0], _COLS[c1 + 1]
    mid = (top + bottom) / 2
    ring = [
        (left, top), (right, top), (right + _BEND, mid), (right, bottom),
        (left, bottom), (left + _BEND, mid), (left, top),
    ]
    return [[list(p) for p in ring]]


def _point_in_ring(x: float, y: float, ring) -> bool:
    inside = False
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


@lru_cache(maxsize=1)
def _dataset():
    """Erzeugt deterministische Beispieldaten (Gebäude + Anlagen)."""
    rng = random.Random(42)
    areas, buildings = [], []
    for plz, name, c0, c1, r, potential_mwp, util in _AREAS:
        poly = _area_polygon(c0, c1, r)
        ring = poly[0]
        xs, ys = [p[0] for p in ring], [p[1] for p in ring]
        areas.append({
            "postal_code": plz, "name": name, "polygon": poly,
            "potential_mwp": potential_mwp, "installed_mwp": round(potential_mwp * util / 100, 2),
            "label_point": ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2),
        })
        n = 40 + int(potential_mwp * 2)
        for i in range(n):
            while True:
                x, y = rng.uniform(min(xs), max(xs)), rng.uniform(min(ys), max(ys))
                if _point_in_ring(x, y, ring):
                    break
            cat = rng.choices(list(CATEGORY_LABELS), weights=[15, 30, 40, 15])[0]
            suit = rng.choices([1, 2, 3, 6], weights=[20, 25, 25, 30])[0]
            roof = rng.choices(list(ROOF_LABELS), weights=[40, 30, 20, 10])[0]
            size = {"residential": 0.00012, "public": 0.0003, "commercial": 0.0004, "agricultural": 0.00025}[cat]
            area_m2 = round((size * 74000) * (size * 111000) * rng.uniform(0.6, 1.0))
            kwp = round(area_m2 * 0.18 * {1: 1.0, 2: 0.85, 3: 0.7, 6: 0.4}[suit], 1)
            installed = round(kwp * rng.uniform(0.3, 1.0), 1) if rng.random() < util / 100 else 0.0
            buildings.append({
                "id": f"DEBW{plz}{i:04d}", "x": x, "y": y, "size": size,
                "category": cat, "suitability": suit, "roof_type": roof, "roof_area_m2": area_m2,
                "potential_kwp": kwp, "installed_kwp": installed, "postal_code": plz,
                "commissioned_on": date(rng.randint(2008, 2026), rng.randint(1, 12), 1) if installed else None,
            })
    return areas, buildings


def _filter(buildings, postal_code=None, category=None, suitability=None, bbox=None):
    box = [float(v) for v in bbox.split(",")] if bbox else None
    for b in buildings:
        if postal_code and b["postal_code"] != postal_code:
            continue
        if category and b["category"] not in category:
            continue
        if suitability and b["suitability"] not in suitability:
            continue
        if box and not (box[0] <= b["x"] <= box[2] and box[1] <= b["y"] <= box[3]):
            continue
        yield b


def _totals(postal_code: Optional[str] = None):
    areas, _ = _dataset()
    sel = [a for a in areas if not postal_code or a["postal_code"] == postal_code]
    inst = round(sum(a["installed_mwp"] for a in sel), 1)
    pot = round(sum(a["potential_mwp"] for a in sel), 1)
    return inst, pot


def _opts(d: dict):
    return [{"value": k, "label": v} for k, v in d.items()]


# ================= öffentliche Funktionen =================

def meta():
    areas, _ = _dataset()
    inst, pot = _totals()
    current = round(inst / pot * 100)
    return {
        "data_status": DATA_STATUS,
        "categories": _opts(CATEGORY_LABELS),
        "suitability_classes": _opts(SUITABILITY_LABELS),
        "roof_types": _opts(ROOF_LABELS),
        "pv_views": _opts(PV_VIEW_LABELS),
        "postal_codes": [{"value": a["postal_code"], "label": f'{a["postal_code"]} {a["name"]}'} for a in areas],
        "sliders": {
            "target_utilization_pct": {"min": current, "max": 100, "step": 1, "default": 60},
            "horizon_years": {"min": 5, "max": 30, "step": 1, "default": 20},
            "electricity_price_ct_per_kwh": {"min": 10, "max": 50, "step": 1, "default": ELECTRICITY_PRICE_CT},
        },
        "electricity_price": {"value_ct_per_kwh": ELECTRICITY_PRICE_CT, "source": "Beispielwert", "is_example": True},
        "sources": [
            {"name": "Marktstammdatenregister", "url": "https://www.marktstammdatenregister.de"},
            {"name": "LUBW Dachflächenpotenzial",
             "url": "https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html"},
            {"name": "Open-Meteo", "url": "https://open-meteo.com"},
        ],
        "data_as_of": DATA_AS_OF,
    }


def status(postal_code: Optional[str] = None):
    _, buildings = _dataset()
    inst, pot = _totals(postal_code)
    count = sum(1 for b in _filter(buildings, postal_code) if b["installed_kwp"] > 0)
    return {
        "installed_power_mwp": inst,
        "potential_power_mwp": pot,
        "utilization_pct": round(inst / pot * 100, 1) if pot else 0.0,
        "installation_count": count,
        "source": SOURCE,
        "data_status": DATA_STATUS,
        "data_as_of": DATA_AS_OF,
    }


def installations(bbox=None, postal_code=None, category=None, max_power_kwp: float = 30):
    _, buildings = _dataset()
    feats = []
    for b in _filter(buildings, postal_code, category, None, bbox):
        if b["installed_kwp"] <= 0 or b["installed_kwp"] > max_power_kwp:
            continue
        feats.append({
            "type": "Feature", "id": f"SEE{b['id'][4:]}",
            "geometry": {"type": "Point", "coordinates": (b["x"], b["y"])},
            "properties": {"power_kwp": b["installed_kwp"], "commissioned_on": b["commissioned_on"],
                           "postal_code": b["postal_code"], "category": b["category"]},
        })
    return {"type": "FeatureCollection", "features": feats}


def buildings(bbox=None, postal_code=None, category=None, suitability=None, only_free_potential=False):
    _, data = _dataset()
    feats = []
    for b in _filter(data, postal_code, category, suitability, bbox):
        if only_free_potential and b["installed_kwp"] > 0:
            continue
        s = b["size"]
        x, y = b["x"], b["y"]
        ring = [[x, y], [x + s, y], [x + s, y + s * 0.66], [x, y + s * 0.66], [x, y]]
        feats.append({
            "type": "Feature", "id": b["id"],
            "geometry": {"type": "Polygon", "coordinates": [ring]},
            "properties": {
                "category": b["category"], "suitability": b["suitability"], "roof_type": b["roof_type"],
                "roof_area_m2": b["roof_area_m2"], "potential_kwp": b["potential_kwp"],
                "potential_yield_kwh_per_year": round(b["potential_kwp"] * SPECIFIC_YIELD_KWH_PER_KWP),
                "installed_kwp": b["installed_kwp"], "postal_code": b["postal_code"],
            },
        })
    return {"type": "FeatureCollection", "features": feats}


def postal_areas(postal_code=None):
    areas, _ = _dataset()
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "id": a["postal_code"],
         "geometry": {"type": "Polygon", "coordinates": a["polygon"]},
         "properties": {
             "postal_code": a["postal_code"], "name": a["name"],
             "installed_power_mwp": a["installed_mwp"], "potential_power_mwp": a["potential_mwp"],
             "utilization_pct": round(a["installed_mwp"] / a["potential_mwp"] * 100, 1),
             "label_point": a["label_point"],
         }}
        for a in areas if not postal_code or a["postal_code"] == postal_code
    ]}


def _breakdown(field: str, labels: dict, rows: Iterable[dict]):
    rows = list(rows)
    total = len(rows) or 1
    items = []
    for key, label in labels.items():
        sel = [b for b in rows if b[field] == key]
        items.append({"key": str(key), "label": label, "building_count": len(sel),
                      "potential_kwp": round(sum(b["potential_kwp"] for b in sel), 1),
                      "share_pct": round(len(sel) / total * 100, 1)})
    return {"basis": "count", "data_status": DATA_STATUS, "items": items}


def roof_types(postal_code=None, category=None, suitability=None):
    _, data = _dataset()
    return _breakdown("roof_type", ROOF_LABELS, _filter(data, postal_code, category, suitability))


def building_categories(postal_code=None, category=None, suitability=None):
    _, data = _dataset()
    return _breakdown("category", CATEGORY_LABELS, _filter(data, postal_code, category, suitability))


def suitability_classes(postal_code=None, category=None, suitability=None):
    _, data = _dataset()
    return _breakdown("suitability", SUITABILITY_LABELS, _filter(data, postal_code, category, suitability))


def forecast(req: ForecastRequest) -> ForecastResponse:
    """Einfaches Wirtschaftlichkeitsmodell für den ZUSÄTZLICHEN Ausbau.

    Konstante Erträge und Preise, ohne Zinsen, Steuern und Degradation.
    Wird später durch pvlib-basierte Ertragsberechnung ersetzt.
    """
    existing, potential = _totals()
    target = potential * req.target_utilization_pct / 100
    new_mwp = max(target - existing, 0.0)
    new_kwp = new_mwp * 1000

    investment = new_kwp * INVESTMENT_EUR_PER_KWP
    energy_kwh = new_kwp * SPECIFIC_YIELD_KWH_PER_KWP
    value = energy_kwh * req.electricity_price_ct_per_kwh / 100
    opex = investment * OPERATING_COST_PCT / 100
    net = value - opex
    amortization = round(investment / net, 1) if net > 0 and investment > 0 else (0.0 if investment == 0 else None)
    co2_t = energy_kwh * CO2_KG_PER_KWH / 1000

    timeline = [
        ForecastYear(year_index=t, year=DATA_AS_OF.year + t, cumulative_balance_eur=round(-investment + t * net))
        for t in range(req.horizon_years + 1)
    ]
    return ForecastResponse(
        data_status=DATA_STATUS,
        existing_power_mwp=round(existing, 2),
        potential_power_mwp=round(potential, 2),
        target_power_mwp=round(target, 2),
        new_power_mwp=round(new_mwp, 2),
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
            specific_yield_kwh_per_kwp=SPECIFIC_YIELD_KWH_PER_KWP,
            operating_cost_pct_of_investment=OPERATING_COST_PCT,
            co2_kg_per_kwh=CO2_KG_PER_KWH,
        ),
        timeline=timeline,
    )
