"""Strompreis: Day-Ahead-Börsenstrompreis über die InfraNode-API.

Quelle der Daten: Bundesnetzagentur | SMARD.de (CC BY 4.0), abgerufen über
https://infranode.dev/api/v1/cities/pforzheim/power-price – laut API-Dokumentation der
„Day-ahead-Großhandelspreis der Gebotszone DE/LU als Tageswert in EUR/MWh (bundesweit,
für alle Städte identisch)“. Es ist also ein Großhandelspreis, kein Endkundenpreis.

Cache: data/cache/power_price.json, 1 Tag. Schlägt der Abruf fehl, bleibt der letzte Stand.
"""
from __future__ import annotations

import json
import logging
import urllib.request
from datetime import date

from .cache import DAY, cached

log = logging.getLogger(__name__)

URL = "https://infranode.dev/api/v1/cities/pforzheim/power-price"
USER_AGENT = "pv-prognose-pforzheim/0.2 (Studienprojekt)"


def _fetch() -> dict:
    req = urllib.request.Request(URL, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.load(r)
    status = body.get("meta", {}).get("source_status")
    if status != "ok":
        raise ValueError(f"InfraNode power-price: source_status={status!r}")
    d = body["data"]
    pl = d["payload"]
    if pl.get("unit") != "EUR/MWh":
        raise ValueError(f"Unerwartete Einheit: {pl.get('unit')!r}")
    eur_mwh = float(pl["value"])
    log.info("Strompreis (SMARD Day-Ahead, %s): %.2f €/MWh", pl.get("series_date"), eur_mwh)
    return {
        "retrieved_at": date.today().isoformat(),
        "series_date": pl.get("series_date"),
        "eur_per_mwh": eur_mwh,
        "ct_per_kwh": round(eur_mwh / 10, 2),  # 1 €/MWh = 0,1 ct/kWh
        "region": pl.get("region"),
        "attribution": (d.get("attribution") or {}).get("text", "Bundesnetzagentur | SMARD.de"),
        "license": d.get("license_id"),
    }


def load(force: bool = False) -> dict:
    return cached("power_price", DAY, _fetch, force=force)
