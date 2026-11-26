"""JSON-Dateicache mit Ablaufzeit.

- `data/cache/`  heruntergeladene Daten, nicht im Git (MaStR)
- `data/osm/`    OSM-Datenstand, im Git – steht nach dem Klonen sofort zur Verfügung

Das Alter einer Datei ergibt sich aus ihrem Feld `retrieved_at` (Abrufdatum), sonst aus dem
Änderungsdatum. So gilt ein frisch geklonter Datenstand nicht fälschlich als neu.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# Überschreibbar mit PV_DATA_DIR (z. B. im Docker-Container)
DATA_DIR = Path(os.environ.get("PV_DATA_DIR") or Path(__file__).resolve().parents[3] / "data")
CACHE_DIR = DATA_DIR / "cache"
DAY = 24 * 3600

_listeners: list[Callable[[str], None]] = []
_refreshing: set[str] = set()
_refresh_lock = threading.Lock()


def on_background_refresh(callback: Callable[[str], None]) -> None:
    """`callback(name)` wird aufgerufen, nachdem eine Hintergrundaktualisierung gespeichert wurde."""
    _listeners.append(callback)


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _write(path: Path, data: Any) -> None:
    # Eindeutiger Name je Thread: parallele Abrufe derselben Quelle überschreiben sich sonst die .tmp-Datei
    tmp = path.with_suffix(f".{os.getpid()}-{threading.get_ident()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp.replace(path)


def _age_s(path: Path, data: Any) -> float:
    retrieved = data.get("retrieved_at") if isinstance(data, dict) else None
    try:
        return time.time() - time.mktime(date.fromisoformat(str(retrieved)[:10]).timetuple())
    except (TypeError, ValueError):
        return time.time() - path.stat().st_mtime


def _refresh_in_background(name: str, path: Path, fetch: Callable[[], Any]) -> None:
    """Holt die Daten einmal pro Prozess neu; bis dahin bleibt der alte Stand in Gebrauch."""
    with _refresh_lock:
        if name in _refreshing:
            return
        _refreshing.add(name)

    def run():
        try:
            log.info("%s ist abgelaufen – aktualisiere im Hintergrund …", name)
            _write(path, fetch())
            log.info("%s aktualisiert", name)
        except Exception:
            log.warning("Aktualisierung von %s fehlgeschlagen – verwende weiter den vorhandenen Stand",
                        name, exc_info=True)
            return
        for cb in _listeners:
            try:
                cb(name)
            except Exception:
                log.exception("Fehler nach Aktualisierung von %s", name)

    threading.Thread(target=run, name=f"refresh-{name}", daemon=True).start()


def cached(name: str, max_age_s: float, fetch: Callable[[], Any], force: bool = False,
           directory: Path = CACHE_DIR, background: bool = False) -> Any:
    """Liefert den gespeicherten Stand; holt neu, wenn er fehlt oder abgelaufen ist.

    `background=True`: Ein abgelaufener Stand wird sofort zurückgegeben und im Hintergrund
    erneuert (Start wird nicht blockiert). Schlägt das Neuladen fehl, bleibt der alte Stand.
    """
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.json"
    data = _read(path) if path.exists() else None
    if data is not None and not force:
        if _age_s(path, data) < max_age_s:
            return data
        if background:
            _refresh_in_background(name, path, fetch)
            return data
    try:
        log.info("Lade %s neu …", name)
        new = fetch()
    except Exception:
        if data is not None:
            log.exception("Neuladen von %s fehlgeschlagen – verwende veralteten Stand", name)
            return data
        raise
    _write(path, new)
    return new


def cache_time(name: str, directory: Path = CACHE_DIR) -> float | None:
    path = directory / f"{name}.json"
    return path.stat().st_mtime if path.exists() else None
