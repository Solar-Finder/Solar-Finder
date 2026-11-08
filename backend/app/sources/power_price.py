"""Strompreis: Jahresmittel des Day-Ahead-Großhandelspreises DE/LU (SMARD).

Quelle: Bundesnetzagentur | SMARD.de (CC BY 4.0), Chart-Daten-Schnittstelle
https://www.smard.de/app/chart_data/4169/DE-LU/… – Filter 4169 = „Marktpreis Deutschland/Luxemburg“,
Auflösung „year“ = Mittelwert über alle Stunden des Kalenderjahres in €/MWh.

Verwendet wird das letzte **abgeschlossene** Kalenderjahr: ein Tageswert schwankt zu stark
(Spitzen und negative Preise), das laufende Jahr ist noch unvollständig.
Es ist ein Großhandelspreis, kein Endkundenpreis.

Cache: data/cache/power_price_year.json, 7 Tage. Schlägt der Abruf fehl, bleibt der letzte Stand.
"""
from __future__ import annotations

import json
import logging
import urllib.request
from datetime import date, datetime, timedelta, timezone

from .cache import DAY, cached

log = logging.getLogger(__name__)

BASE = "https://www.smard.de/app/chart_data/4169/DE-LU"
URL = "https://www.smard.de/home/marktdaten"  # Quellenangabe für die Oberfläche
USER_AGENT = "pv-prognose-pforzheim/0.3 (Studienprojekt)"
ATTRIBUTION = "Bundesnetzagentur | SMARD.de"


def _get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def _year_of(ts_ms: int) -> int:
    # Zeitstempel = Jahresbeginn in deutscher Zeit (z. B. 31.12. 23:00 UTC) → ein paar Stunden addieren
    return (datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc) + timedelta(hours=12)).year


def _fetch() -> dict:
    stamps = _get(f"{BASE}/index_year.json")["timestamps"]
    this_year = date.today().year
    for ts in sorted(stamps, reverse=True):
        year = _year_of(ts)
        if year >= this_year:  # laufendes Jahr ist noch nicht abgeschlossen
            continue
        series = _get(f"{BASE}/4169_DE-LU_year_{ts}.json")["series"]
        values = [v for t, v in series if t == ts and v is not None]
        if values:
            eur_mwh = float(values[0])
            break
    else:
        raise ValueError("SMARD: kein Jahresmittelwert für ein abgeschlossenes Jahr gefunden")
    log.info("Strompreis (SMARD Day-Ahead, Jahresmittel %d): %.2f €/MWh", year, eur_mwh)
    return {
        "retrieved_at": date.today().isoformat(),
        "year": year,
        "eur_per_mwh": eur_mwh,
        "ct_per_kwh": round(eur_mwh / 10, 2),  # 1 €/MWh = 0,1 ct/kWh
        "region": "DE-LU",
        "attribution": ATTRIBUTION,
        "license": "cc_by_4_0",
    }


def load(force: bool = False) -> dict:
    return cached("power_price_year", 7 * DAY, _fetch, force=force)
