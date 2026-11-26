"""Datenschicht: Kennzahlen, Kartendaten, Diagramme, Prognose.

Formeln und Herkunft aller Werte: docs/datenmodell.md

Aus Daten:
- Bestand: Marktstammdatenregister (alle PV-Einheiten in Betrieb, Pforzheim)
- Potenzial, Ertrag, CO₂, Eignungsklasse, Dachform: LUBW-Dachseiten (Klassen 1–3)
- PLZ-Grenzen, Gebäudekategorie, zusätzliche Dachanlagen: OpenStreetMap

- Strompreis: Day-Ahead-Börsenstrompreis (SMARD), Jahresmittel des letzten abgeschlossenen Jahres
- Anschaffungskosten je Gebäude: Preistabelle in data/ (Stand 2025)

Vorgaben: laufende Kosten 1 % der Anschaffungskosten pro Jahr.
Beispielwerte (keine Quelle im Projekt): Investition €/kWp im Rechner, Stromverbrauch der Stadt.
"""
from __future__ import annotations

import logging
from collections.abc import Iterable
from datetime import date

from shapely.geometry import Point, box

from .geo_model import Building, get_model, is_roof_unit
from .sources import alkis, costs, power_price

log = logging.getLogger(__name__)
from .schemas import (
    DataStatus,
    ForecastAssumptions,
    ForecastRequest,
    ForecastResponse,
    ForecastYear,
)

# ---- Beispielwerte (müssen noch belegt werden) ----
INVESTMENT_EUR_PER_KWP = 900.0
CONSUMPTION_GWH_PER_YEAR = 300.0
ELECTRICITY_PRICE_FALLBACK_CT = 18.0  # nur falls der Strompreis noch nie abgerufen werden konnte
OPERATING_COST_PCT = costs.OPERATING_COST_PCT  # laufende Kosten: 1 % der Anschaffung pro Jahr (Vorgabe)
# Strompreissteigerung: Energieatlas BW (LUBW), Grundlagen PV-Dachflächen, „Steigerung der Stromkosten“:
# „Im Wirtschaftlichkeitsrechner wird mit einer Steigerung der Strompreise von 0,6 Cent/kWh pro Jahr gerechnet“
# (Mittelwert mehrerer konservativer Schätzungen).
PRICE_INCREASE_CT_PER_YEAR = 0.6
PRICE_INCREASE_SOURCE = "Energieatlas Baden-Württemberg (LUBW), Grundlagen PV-Dachflächen – Steigerung der Stromkosten"
PRICE_INCREASE_URL = "https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen"
# Alterung der Module: Energieatlas BW (LUBW), Grundlagen PV-Dachflächen – 0,25 % Ertragsminderung pro Jahr
DEGRADATION_PCT_PER_YEAR = 0.25
AMORTIZATION_MAX_YEARS = 100  # Suche nach dem Amortisationszeitpunkt über den Zeitraum hinaus


def _price_for_year(year: int, price0_ct: float) -> float:
    """Strompreis im Jahr `year` (1 = erstes Jahr = Ausgangswert, danach +0,6 ct/kWh je Jahr)."""
    return price0_ct + PRICE_INCREASE_CT_PER_YEAR * (year - 1)


def _energy_for_year(year: int, energy0_kwh: float) -> float:
    """Ertrag im Jahr `year`: Ertrag des 1. Jahres × (1 − 0,25 %)^(year − 1)."""
    return energy0_kwh * (1 - DEGRADATION_PCT_PER_YEAR / 100) ** (year - 1)


def _value_for_year(year: int, energy0_kwh: float, price0_ct: float) -> float:
    """Stromwert (€) im Jahr `year` = Ertrag im Jahr × Strompreis im Jahr."""
    return _energy_for_year(year, energy0_kwh) * _price_for_year(year, price0_ct) / 100


def _amortization(purchase: float, energy0_kwh: float, price0_ct: float) -> float | None:
    """Zeitpunkt (Jahre, anteilig im Jahr), ab dem Σ Stromwert die Anschaffungskosten deckt.

    Gerechnet nur mit den Anschaffungskosten – laufende Kosten/Instandhaltung zählen hier nicht.
    """
    if purchase <= 0:
        return 0.0
    balance = -purchase
    for year in range(1, AMORTIZATION_MAX_YEARS + 1):
        value = _value_for_year(year, energy0_kwh, price0_ct)
        if value > 0 and balance + value >= 0:
            return round(year - 1 + (-balance) / value, 1)
        balance += value
    return None


def electricity_price() -> dict:
    """Strompreis: SMARD Day-Ahead, Jahresmittel des letzten abgeschlossenen Jahres;
    ohne Abruf/Cache: gekennzeichneter Beispielwert."""
    try:
        p = power_price.load()
    except Exception:
        log.exception("Strompreis nicht abrufbar – verwende Beispielwert")
        return {"value_ct_per_kwh": ELECTRICITY_PRICE_FALLBACK_CT, "source": "Beispielwert", "is_example": True,
                "year": None, "retrieved_at": None}
    return {"value_ct_per_kwh": p["ct_per_kwh"], "is_example": False, "year": p["year"],
            "retrieved_at": p.get("retrieved_at"),
            "source": f"Day-Ahead-Börsenpreis, Jahresmittel {p['year']}, {p['attribution']}"}

MAX_BUILDINGS = 8000

CATEGORY_LABELS = {
    "residential": "Wohngebäude",
    "mixed": "Wohn- und Geschäftsgebäude",
    "public": "Öffentliche Gebäude",
    "commercial": "Gewerbe & Industrie",
    "agricultural": "Landwirtschaft",
    "ancillary": "Nebengebäude",
    "other": "Sonstige / nicht klassifiziert",
}
SUITABILITY_LABELS = {
    1: "Klasse 1",
    2: "Klasse 2",
    3: "Klasse 3",
    6: "Klasse 6 · keine PV-Fläche",
    8: "Klasse 8 · nicht berechnet",
    0: "Klasse 0 · Dachtyp unbekannt",
}
ROOF_LABELS = {"pitched": "Geneigtes Dach (Spitzdach)", "flat": "Flachdach", "mixed": "Flach- und Spitzdach",
               "unknown": "Unbekannt"}
PV_VIEW_LABELS = {"potential": "Potenzial", "existing": "Bestand"}


def _opts(d: dict):
    return [{"value": k, "label": v} for k, v in d.items()]


def _iso(d: str | None) -> date | None:
    return date.fromisoformat(d) if d else None


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _totals(postal_code: str | None = None) -> dict:
    """Bestand (MaStR) und Potenzial (LUBW) in kWp bzw. kWh/a."""
    m = get_model()
    units = [u for u in m.units if not postal_code or u["postal_code"] == postal_code]
    if postal_code:
        blds = [b for b in m.buildings if b.postal_code == postal_code]
        pot_kwp = sum(b.potential_kwp for b in blds)
        pot_kwh = sum(b.potential_kwh_per_year for b in blds)
    else:  # ganze Stadt: direkt aus dem LUBW-Datensatz, unabhängig von der PLZ-Zuordnung
        pot_kwp = m.lubw["totals"]["potential_kwp"]
        pot_kwh = m.lubw["totals"]["potential_kwh_per_year"]
    return {
        "units": units,
        "installed_kwp": sum(u["power_kwp"] for u in units),
        "installed_roof_kwp": sum(u["power_kwp"] for u in units if is_roof_unit(u)),
        "potential_kwp": pot_kwp,
        "potential_kwh": pot_kwh,
    }


# ================= öffentliche Funktionen =================

def meta():
    m = get_model()
    t = _totals()
    current = int(t["installed_roof_kwp"] / t["potential_kwp"] * 100) if t["potential_kwp"] else 0
    sources = [
        {"name": "Marktstammdatenregister", "url": "https://www.marktstammdatenregister.de",
         "retrieved_at": _iso(m.retrieved["mastr"]), "note": "PV-Anlagen in Betrieb; Koordinaten nur > 30 kW"},
        {"name": f"LUBW Solarpotenzial Dachflächen {m.lubw['data_year'] or ''}".strip(),
         "url": "https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html",
         "retrieved_at": _iso(m.retrieved["lubw"]),
         "note": f"{m.lubw['origin']}; {m.lubw['totals']['roof_faces']} Dachseiten, "
                 f"{m.lubw['totals']['buildings']} Gebäude"},
    ]
    price = electricity_price()
    if not price["is_example"]:
        sources.append({"name": f"Strompreis: SMARD Day-Ahead, Jahresmittel {price['year']}",
                        "url": power_price.URL, "retrieved_at": _iso(price["retrieved_at"]),
                        "note": "Bundesnetzagentur | SMARD.de, CC BY 4.0; Großhandelspreis DE/LU, "
                                "Mittel über alle Stunden des Jahres"})
    if m.alkis_available:
        sources.append({"name": "LGL 3D-Gebäudemodelle LoD2 (ALKIS-Gebäudefunktion)",
                        "url": "https://www.lgl-bw.de/Produkte/3D-Produkte/3D-Gebaeudemodelle/",
                        "retrieved_at": _iso(m.retrieved["alkis"]),
                        "note": f"{alkis.ATTRIBUTION}; Gebäudefunktion zu Kategorien zusammengefasst"})
    if m.osm_available:
        sources.append({"name": "OpenStreetMap (PLZ-Grenzen, Gebäudenamen)" if m.alkis_available
                        else "OpenStreetMap (PLZ-Grenzen, Gebäudeart)", "url": "https://www.openstreetmap.org/copyright",
                        "retrieved_at": _iso(m.retrieved["osm_buildings"]), "note": "© OpenStreetMap-Mitwirkende, ODbL"})
    return {
        "installed_status": DataStatus.verified,
        "potential_status": DataStatus.verified,
        "suitability_status": DataStatus.verified,
        "categories": _opts(CATEGORY_LABELS),
        "suitability_classes": _opts(SUITABILITY_LABELS),
        "roof_types": _opts(ROOF_LABELS),
        "pv_views": _opts(PV_VIEW_LABELS),
        "postal_codes": [{"value": a["postal_code"], "label": a["name"]} for a in m.areas],
        "sliders": {
            "target_utilization_pct": {"min": current, "max": 100, "step": 1, "default": max(current, 30)},
            "horizon_years": {"min": 5, "max": 30, "step": 1, "default": 20},
            "electricity_price_ct_per_kwh": {"min": 0, "max": 50, "step": 1, "default": price["value_ct_per_kwh"]},
        },
        "electricity_price": {k: price[k] for k in ("value_ct_per_kwh", "source", "is_example")},
        "sources": sources,
        "data_as_of": _iso(m.retrieved["mastr"]),
    }


def status(postal_code: str | None = None):
    m = get_model()
    t = _totals(postal_code)
    units = t["units"]
    return {
        "installed_power_mwp": round(t["installed_kwp"] / 1000, 1),
        "installed_roof_power_mwp": round(t["installed_roof_kwp"] / 1000, 1),
        "potential_power_mwp": round(t["potential_kwp"] / 1000, 1),
        "potential_energy_mwh_per_year": round(t["potential_kwh"] / 1000),
        "utilization_pct": _pct(t["installed_roof_kwp"], t["potential_kwp"]),
        "installation_count": len(units),
        "located_installation_count": sum(1 for u in units if u.get("lat")),
        "balcony_count": sum(1 for u in units if "Balkon" in (u.get("plant_type") or "")),
        "installed_status": DataStatus.verified,
        "potential_status": DataStatus.verified,
        "source": "MaStR · LUBW Solarpotenzial Dachflächen",
        "data_as_of": _iso(m.retrieved["mastr"]),
    }


def postal_areas(postal_code=None):
    m = get_model()
    feats = []
    for a in m.areas:
        if postal_code and a["postal_code"] != postal_code:
            continue
        st = m.plz_stats.get(a["postal_code"], {})
        roof, pot = st.get("installed_roof_kwp", 0.0), st.get("potential_kwp", 0.0)
        lp = a["geom"].representative_point()
        feats.append({
            "type": "Feature", "id": a["postal_code"], "geometry": a["geometry"],
            "properties": {
                "postal_code": a["postal_code"], "name": a["name"],
                "installed_power_mwp": round(st.get("installed_kwp", 0.0) / 1000, 2),
                "installed_roof_power_mwp": round(roof / 1000, 2),
                "potential_power_mwp": round(pot / 1000, 2),
                "potential_energy_mwh_per_year": round(st.get("potential_kwh", 0.0) / 1000),
                "utilization_pct": _pct(roof, pot),
                "installation_count": st.get("units", 0), "located_installation_count": st.get("located", 0),
                "balcony_count": st.get("balcony", 0),
                "buildings_with_solar": st.get("buildings_with_solar", 0),
                "buildings_with_potential": st.get("buildings_potential", 0),
                "label_point": (round(lp.x, 6), round(lp.y, 6)),
            },
        })
    return {"type": "FeatureCollection", "features": feats, "potential_status": DataStatus.verified}


def _bbox(bbox: str | None):
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
        if postal_code and b.postal_code != postal_code:
            continue
        if category and b.category not in category:
            continue
        if suitability and b.suitability not in suitability:
            continue
        yield b


def building_profile(b: Building, price_ct: float, price_is_example: bool = False) -> dict:
    """Steckbrief eines Gebäudes: Bestand, offenes Potenzial und Wirtschaftlichkeit des Ausbaus.

    - Offenes Potenzial = LUBW-Potenzial − installierte Leistung (MaStR), mindestens 0.
      Ohne Anlage ist das das gesamte Potenzial.
    - Anschaffungskosten = offene kWp × Preis je kWp der Größenstufe (costs.py, Tabelle in data/).
    - Laufende Kosten = 1 % der Anschaffungskosten pro Jahr.
    - Ertrag/CO₂ des Ausbaus (1. Jahr) = offene kWp × spezifischer Ertrag bzw. CO₂ je kWp dieses Gebäudes (LUBW).
    - Amortisation = Zeitpunkt, ab dem Σ (Ertrag im Jahr t × Strompreis im Jahr t) ≥ Anschaffungskosten
      (ohne laufende Kosten); Ertrag sinkt um 0,25 % je Jahr (Alterung), Strompreis = SMARD-Jahresmittel
      im 1. Jahr, danach +0,6 ct/kWh je Jahr (Energieatlas BW) – wie im Rechner.
    Ist die Anlage größer als das LUBW-Potenzial, gilt das Dach als zu 100 % ausgeschöpft.
    Hat ein Gebäude nur eine in OSM erfasste Anlage (Leistung unbekannt), wird kein Ausbau gerechnet.
    """
    known = bool(b.mastr_ids)
    unknown_installed = b.has_solar and not known
    p = {
        "roof_area_m2": b.roof_area_m2,
        "pv_area_m2": b.pv_area_m2,
        "installed_known": not unknown_installed,
        "utilization_pct": None,
        "open_kwp": None,
        "price_eur_per_kwp": None,
        "price_outside_table": False,
        "investment_eur": None,
        "operating_cost_eur_per_year": None,
        "energy_kwh_per_year": None,
        "co2_savings_kg_per_year": None,
        "amortization_years": None,
        "electricity_price_ct_per_kwh": price_ct,
        "electricity_price_is_example": price_is_example,
        "price_increase_ct_per_kwh_per_year": PRICE_INCREASE_CT_PER_YEAR,
        "degradation_pct_per_year": DEGRADATION_PCT_PER_YEAR,
        "operating_cost_pct": costs.OPERATING_COST_PCT,
    }
    if b.has_solar and known:
        # Anlage auf einem Dach ohne LUBW-Potenzial bzw. größer als das Potenzial → ausgeschöpft
        p["utilization_pct"] = (100.0 if b.potential_kwp <= 0
                                else min(round(b.installed_kwp / b.potential_kwp * 100, 1), 100.0))
    if unknown_installed:
        return p

    open_kwp = max(b.potential_kwp - (b.installed_kwp if known else 0.0), 0.0)
    p["open_kwp"] = round(open_kwp, 1)
    if open_kwp <= 0:
        return p
    price, outside = costs.price_per_kwp(open_kwp)
    invest = open_kwp * price
    opex = invest * costs.OPERATING_COST_PCT / 100
    energy = open_kwp * b.potential_kwh_per_year / b.potential_kwp
    p.update({
        "price_eur_per_kwp": price,
        "price_outside_table": outside,
        "investment_eur": round(invest),
        "operating_cost_eur_per_year": round(opex),
        "energy_kwh_per_year": round(energy),
        "co2_savings_kg_per_year": round(open_kwp * b.co2_savings_kg_per_year / b.potential_kwp),
        "amortization_years": _amortization(invest, energy, price_ct),
    })
    return p


def buildings(bbox=None, postal_code=None, category=None, solar_status=None, limit=MAX_BUILDINGS):
    feats, truncated = [], False
    price = electricity_price()
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
                "category": b.category, "building_type": b.building_type, "alkis_function": b.alkis_function,
                "name": b.name, "osm_id": b.osm_id,
                "footprint_m2": b.footprint_m2, "solar_status": b.solar_status,
                "installed_kwp": round(b.installed_kwp, 1), "solar_sources": sources,
                "potential_kwp": round(b.potential_kwp, 1), "potential_status": DataStatus.verified,
                "potential_kwh_per_year": round(b.potential_kwh_per_year),
                "co2_savings_kg_per_year": round(b.co2_savings_kg_per_year),
                "roof_faces": b.roof_faces, "suitable_roof_faces": b.suitable_roof_faces,
                "suitability": b.suitability, "roof_type": b.roof_type,
                "postal_code": b.postal_code,
                "profile": building_profile(b, price["value_ct_per_kwh"], price["is_example"]),
            },
        })
    return {"type": "FeatureCollection", "features": feats, "truncated": truncated}


def installations(bbox=None, postal_code=None, max_power_kwp: float | None = None, category=None):
    """Verortete MaStR-Anlagen; mit `category` nur solche, deren zugeordnetes Gebäude passt
    (Anlagen ohne zugeordnetes Gebäude fallen dann weg, ihre Kategorie ist unbekannt)."""
    m = get_model()
    area = _bbox(bbox)
    units = [u for u in m.units if not postal_code or u["postal_code"] == postal_code]
    feats = []
    for u in units:
        if not u.get("lat"):
            continue
        if area is not None and not area.contains(Point(u["lon"], u["lat"])):
            continue
        if max_power_kwp is not None and u["power_kwp"] > max_power_kwp:
            continue
        b = m.by_id.get(u.get("building_id"))
        if category and (b is None or b.category not in category):
            continue
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

    Format: [[lon, lat, status, eignungsklasse, potenzial_kwp], …] mit status 1 = Anlage vorhanden,
    2 = ungenutztes Potenzial, 0 = kein nennenswertes Potenzial; Eignungsklasse laut LUBW (beste
    Dachseite), installierbare Leistung = Σ Power der Klassen 1–3 (LUBW). Das Frontend filtert
    Gebäude ohne Anlage nach der Klasse und färbt sie nach der installierbaren Leistung.
    """
    wanted = set(solar_status or ["existing", "potential", "none"])
    pts = [
        [b.center[0], b.center[1], STATUS_CODE[b.solar_status], b.suitability, round(b.potential_kwp, 1)]
        for b in _filtered_buildings(postal_code, category)
        if b.solar_status in wanted
    ]
    return {"status_codes": {"1": "existing", "2": "potential", "0": "none"}, "points": pts}


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
    m = get_model()
    rows = _filtered_buildings(postal_code, category, suitability=suitability)
    if m.alkis_available:
        note = "Gebäudefunktion laut ALKIS (LGL, dl-de/by-2-0)"
    elif m.osm_available:
        note = "Gebäudeart laut OpenStreetMap"
    else:
        note = "Keine Gebäudeart verfügbar – alle Gebäude „Sonstige“"
    return _breakdown(rows, lambda b: b.category, CATEGORY_LABELS,
                      DataStatus.verified if (m.alkis_available or m.osm_available) else DataStatus.pending, note=note)


def roof_types(postal_code=None, category=None, suitability=None):
    rows = _filtered_buildings(postal_code, category, suitability=suitability)
    return _breakdown(rows, lambda b: b.roof_type, ROOF_LABELS, DataStatus.verified,
                      note="Dachform laut LUBW (Dachseiten je Gebäude)")


def suitability_classes(postal_code=None, category=None, suitability=None):
    rows = _filtered_buildings(postal_code, category)
    return _breakdown(rows, lambda b: b.suitability, SUITABILITY_LABELS, DataStatus.verified,
                      note="Beste Eignungsklasse der Dachseiten je Gebäude (LUBW)")


def forecast(req: ForecastRequest) -> ForecastResponse:
    """Zusätzlicher Dach-PV-Ausbau bis zur Ziel-Ausnutzung des LUBW-Potenzials.

    Ertrag und CO₂ aus LUBW, Bestand aus MaStR (Gebäudesolaranlagen); Kosten und Verbrauch
    sind Beispielwerte. Investition = Anschaffung + Instandhaltung (1 %/Jahr) über den Zeitraum.
    Gewinn = Σ Stromwert − Investition. Die Saldo-Kurve zieht Anschaffung und Instandhaltung ab
    (Endwert = Gewinn); die Amortisation rechnet nur mit der Anschaffung. Strompreis steigt jährlich um 0,6 ct/kWh, Ertrag sinkt um 0,25 % je Jahr
    (beides Energieatlas BW); ohne Zinsen und Steuern.
    """
    m = get_model()
    t = _totals()
    lt = m.lubw["totals"]
    existing_kwp, potential_kwp = t["installed_roof_kwp"], t["potential_kwp"]
    target_kwp = potential_kwp * req.target_utilization_pct / 100
    new_kwp = max(target_kwp - existing_kwp, 0.0)

    specific_yield = lt["specific_yield_kwh_per_kwp"]   # kWh/kWp, LUBW
    co2_factor = lt["co2_kg_per_kwh"]                    # kg/kWh, LUBW
    energy0_kwh = new_kwp * specific_yield  # Ertrag im 1. Jahr, danach −0,25 % je Jahr
    years = range(1, req.horizon_years + 1)
    energy_total = sum(_energy_for_year(y, energy0_kwh) for y in years)
    energy_kwh = energy_total / req.horizon_years  # Ø Jahresertrag im Zeitraum
    # Investition (gesamt) = Anschaffung + Instandhaltung (1 % der Anschaffung pro Jahr) über den Zeitraum;
    # der Gewinn zieht sie einmal ab. Saldo-Kurve: −Anschaffung, dann je Jahr + Stromwert − Instandhaltung,
    # damit ihr Endwert dem Gewinn entspricht. Amortisation: nur Anschaffung gegen Stromwert.
    purchase = new_kwp * INVESTMENT_EUR_PER_KWP
    opex = purchase * OPERATING_COST_PCT / 100
    maintenance_total = opex * req.horizon_years
    investment = purchase + maintenance_total
    price0 = req.electricity_price_ct_per_kwh
    revenues = [_value_for_year(y, energy0_kwh, price0) for y in years]  # Stromwert je Jahr
    cumulative = [-purchase]  # Saldo inkl. Instandhaltung – Endwert = Gewinn
    for r in revenues:
        cumulative.append(cumulative[-1] + r - opex)
    value = sum(revenues) / len(revenues) if revenues else 0.0  # Ø Stromwert (Preis steigt, Ertrag sinkt)
    profit = sum(revenues) - investment
    amortization = _amortization(purchase, energy0_kwh, price0)
    co2_t = energy_kwh * co2_factor / 1000  # Ø pro Jahr
    start_year = _iso(m.retrieved["mastr"]).year

    return ForecastResponse(
        data_status=DataStatus.example,
        existing_power_mwp=round(existing_kwp / 1000, 1),
        potential_power_mwp=round(potential_kwp / 1000, 1),
        target_power_mwp=round(target_kwp / 1000, 1),
        new_power_mwp=round(new_kwp / 1000, 1),
        investment_eur=round(investment),
        purchase_cost_eur=round(purchase),
        maintenance_cost_total_eur=round(maintenance_total),
        profit_eur=round(profit),
        electricity_value_eur_per_year=round(value),
        operating_cost_eur_per_year=round(opex),
        amortization_years=amortization,
        energy_per_year_mwh=round(energy_kwh / 1000),
        energy_total_mwh=round(energy_total / 1000),
        consumption_gwh_per_year=CONSUMPTION_GWH_PER_YEAR,
        solar_share_pct=round(energy_kwh / 1e6 / CONSUMPTION_GWH_PER_YEAR * 100, 1),
        co2_savings_t_per_year=round(co2_t),
        co2_savings_t_total=round(energy_total * co2_factor / 1000),
        assumptions=ForecastAssumptions(
            investment_eur_per_kwp=INVESTMENT_EUR_PER_KWP,
            specific_yield_kwh_per_kwp=round(specific_yield, 1),
            operating_cost_pct_of_investment=OPERATING_COST_PCT,
            co2_kg_per_kwh=round(co2_factor, 3),
            consumption_gwh_per_year=CONSUMPTION_GWH_PER_YEAR,
            price_increase_ct_per_kwh_per_year=PRICE_INCREASE_CT_PER_YEAR,
            price_increase_source=PRICE_INCREASE_SOURCE,
            price_increase_url=PRICE_INCREASE_URL,
            degradation_pct_per_year=DEGRADATION_PCT_PER_YEAR,
            status={
                "specific_yield_kwh_per_kwp": DataStatus.verified,
                "co2_kg_per_kwh": DataStatus.verified,
                "investment_eur_per_kwp": DataStatus.example,
                "operating_cost_pct_of_investment": DataStatus.example,
                "consumption_gwh_per_year": DataStatus.example,
                "price_increase_ct_per_kwh_per_year": DataStatus.verified,
                "degradation_pct_per_year": DataStatus.verified,
            },
        ),
        timeline=[
            ForecastYear(year_index=i, year=start_year + i, cumulative_balance_eur=round(cumulative[i]),
                         electricity_price_ct_per_kwh=round(_price_for_year(max(i, 1), price0), 2))
            for i in range(req.horizon_years + 1)
        ],
    )
