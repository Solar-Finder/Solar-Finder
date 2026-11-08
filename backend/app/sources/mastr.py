"""Marktstammdatenregister (MaStR) – öffentliche Einheiten der Stromerzeugung.

API-Doku: https://github.com/bundesAPI/marktstammdaten-api
Öffentlich sind Straße/Hausnummer und Koordinaten nur bei Anlagen > 30 kW;
kleinere Anlagen sind lediglich einer Postleitzahl zugeordnet.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone
from typing import Optional

from .cache import DAY, cached
from .osm import POSTAL_CODES

log = logging.getLogger(__name__)

BASE = "https://www.marktstammdatenregister.de/MaStR/Einheit/EinheitJson/GetErweiterteOeffentlicheEinheitStromerzeugung"
GEMEINDESCHLUESSEL = "08231000"  # Pforzheim
ENERGIETRAEGER_SOLAR = "2495"     # Solare Strahlungsenergie
STATUS_IN_BETRIEB = "35"
PAGE_SIZE = 2000

# Felder, die wir behalten (Rest der Antwort wird verworfen)
_FIELDS = {
    "MaStRNummer": "id",
    "Plz": "postal_code",
    "Ort": "city",
    "Strasse": "street",
    "Hausnummer": "house_number",
    "Breitengrad": "lat",
    "Laengengrad": "lon",
    "Bruttoleistung": "power_kwp",
    "InbetriebnahmeDatum": "commissioned_on",
    "ArtDerSolaranlageBezeichnung": "plant_type",
    "NutzungsbereichGebSABezeichnung": "building_use",
    "AnzahlSolarModule": "module_count",
}


def _parse_date(v: Optional[str]) -> Optional[str]:
    """'/Date(1369612800000)/' → '2013-05-27'"""
    m = re.match(r"/Date\((-?\d+)\)/", v or "")
    if not m:
        return None
    return datetime.fromtimestamp(int(m.group(1)) / 1000, tz=timezone.utc).date().isoformat()


def _fetch() -> dict:
    flt = (
        f"Gemeindeschlüssel~eq~'{GEMEINDESCHLUESSEL}'"
        f"~and~Energieträger~eq~'{ENERGIETRAEGER_SOLAR}'"
        f"~and~Betriebs-Status~eq~'{STATUS_IN_BETRIEB}'"
    )
    rows, page, total = [], 1, None
    while total is None or len(rows) < total:
        url = f"{BASE}?{urllib.parse.urlencode({'filter': flt, 'page': page, 'pageSize': PAGE_SIZE})}"
        req = urllib.request.Request(url, headers={"User-Agent": "pv-prognose-pforzheim/0.2"})
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        if d.get("Errors"):
            raise RuntimeError(f"MaStR-Fehler: {d['Errors']}")
        total = d["Total"]
        if not d["Data"]:
            break
        rows += d["Data"]
        page += 1

    units = []
    for r in rows:
        u = {new: r.get(old) for old, new in _FIELDS.items()}
        u["commissioned_on"] = _parse_date(u["commissioned_on"])
        u["power_kwp"] = float(u["power_kwp"] or 0)
        units.append(u)
    return {"retrieved_at": date.today().isoformat(), "units": units}


def _in_pforzheim(u: dict) -> bool:
    """Einige Einheiten tragen den Gemeindeschlüssel Pforzheim, aber PLZ/Ort einer Nachbargemeinde
    (z. B. 75449 Wurmberg, 75399 Unterreichenbach). Sie liegen außerhalb des LUBW-Gebiets und
    der PLZ-Grenzen und werden deshalb verworfen."""
    return u.get("postal_code") in POSTAL_CODES


def load(force: bool = False) -> dict:
    """Alle in Betrieb befindlichen PV-Einheiten mit Pforzheimer PLZ (Cache: 1 Tag)."""
    data = cached("mastr_pforzheim_solar", DAY, _fetch, force=force)
    units = [u for u in data["units"] if _in_pforzheim(u)]
    dropped = [u for u in data["units"] if not _in_pforzheim(u)]
    if dropped:
        log.info("MaStR: %d Einheiten (%.1f kW) außerhalb Pforzheims verworfen: %s", len(dropped),
                 sum(u["power_kwp"] for u in dropped),
                 ", ".join(sorted({f"{u.get('postal_code')} {u.get('city')}" for u in dropped})))
    return {**data, "units": units, "excluded_outside_city": len(dropped)}
