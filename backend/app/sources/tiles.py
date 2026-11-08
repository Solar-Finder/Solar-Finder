"""Kartenkacheln über das eigene Backend (Datenschutz).

Der Browser lädt die Kacheln nicht mehr direkt bei OpenStreetMap bzw. Esri, sondern hier.
Die Kachelserver sehen dadurch nur die Anfrage des Backends – nicht die IP-Adresse, den
Browser oder die aufgerufene Seite der Nutzer. Weitergereicht werden nur z/x/y; Header der
Nutzer (IP, User-Agent, Referer, Cookies) werden nicht übernommen.

Cache: data/cache/tiles/<basemap>/<z>/<x>/<y>, 7 Tage (OSM-Kachelrichtlinie verlangt
Zwischenspeichern, https://operations.osmfoundation.org/policies/tiles/). Ist der Kachelserver
nicht erreichbar, wird ein veralteter Stand aus dem Cache geliefert.
"""
from __future__ import annotations

import logging
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Optional

from .cache import CACHE_DIR, DAY

log = logging.getLogger(__name__)

TILE_DIR: Path = CACHE_DIR / "tiles"
MAX_AGE_S = 7 * DAY
MAX_ZOOM = 19
USER_AGENT = "pv-prognose-pforzheim/0.3 (Studienprojekt; Kachel-Proxy mit Cache)"

# Vorlagen der Kachelserver – {z}/{x}/{y} wie in Leaflet
UPSTREAM = {
    "standard": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "aerial": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
}


class TileNotFound(Exception):
    """Ungültige Kachel oder vom Kachelserver nicht geliefert."""


def _valid(z: int, x: int, y: int) -> bool:
    n = 2 ** z
    return 0 <= z <= MAX_ZOOM and 0 <= x < n and 0 <= y < n


def _sniff_type(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"\xff\xd8"):
        return "image/jpeg"
    return "application/octet-stream"


def _fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/*"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def get_tile(basemap: str, z: int, x: int, y: int) -> tuple[bytes, str]:
    """(Bilddaten, Content-Type) einer Kachel – aus dem Cache oder vom Kachelserver."""
    template = UPSTREAM.get(basemap)
    if template is None or not _valid(z, x, y):
        raise TileNotFound(f"{basemap}/{z}/{x}/{y}")

    path = TILE_DIR / basemap / str(z) / str(x) / str(y)
    cached: Optional[bytes] = path.read_bytes() if path.exists() else None
    if cached is not None and time.time() - path.stat().st_mtime < MAX_AGE_S:
        return cached, _sniff_type(cached)

    try:
        data = _fetch(template.format(z=z, x=x, y=y))
    except urllib.error.HTTPError as e:
        if cached is not None:
            return cached, _sniff_type(cached)
        if e.code == 404:
            raise TileNotFound(f"{basemap}/{z}/{x}/{y}") from e
        raise
    except Exception:  # noqa: BLE001 – Netzwerkfehler: veralteten Stand liefern, falls vorhanden
        if cached is not None:
            log.warning("Kachel %s/%s/%s/%s nicht abrufbar – verwende Cache", basemap, z, x, y)
            return cached, _sniff_type(cached)
        raise

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.{threading.get_ident()}.tmp")
    tmp.write_bytes(data)
    tmp.replace(path)  # atomar; eigene Temp-Datei je Thread, falls dieselbe Kachel parallel kommt
    return data, _sniff_type(data)
