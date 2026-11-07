"""Einfacher JSON-Dateicache mit Ablaufzeit (backend/data/cache, nicht im Git)."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any, Callable

log = logging.getLogger(__name__)

CACHE_DIR = Path(__file__).resolve().parents[2] / "data" / "cache"
DAY = 24 * 3600


def cached(name: str, max_age_s: float, fetch: Callable[[], Any], force: bool = False) -> Any:
    """Liefert den Cache-Inhalt; holt neu, wenn er fehlt oder abgelaufen ist.

    Schlägt das Neuladen fehl, wird ein vorhandener (veralteter) Cache weiterverwendet.
    """
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = CACHE_DIR / f"{name}.json"
    fresh = path.exists() and time.time() - path.stat().st_mtime < max_age_s
    if fresh and not force:
        return json.loads(path.read_text(encoding="utf-8"))
    try:
        log.info("Lade %s neu …", name)
        data = fetch()
    except Exception:  # noqa: BLE001 – Netzwerkfehler sollen den Betrieb nicht stoppen
        if path.exists():
            log.exception("Neuladen von %s fehlgeschlagen – verwende veralteten Cache", name)
            return json.loads(path.read_text(encoding="utf-8"))
        raise
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)
    return data


def cache_time(name: str) -> float | None:
    path = CACHE_DIR / f"{name}.json"
    return path.stat().st_mtime if path.exists() else None
