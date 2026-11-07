"""Anschaffungskosten für PV-Anlagen je kWp, gestaffelt nach Anlagengröße.

Quelle: data/Tabelle_Anschaffungskosten_PVprokWp.md („Angenommene Komplettpreise für
Photovoltaikanlagen (Stand 2025)“, Nettopreise). Die Datei wird beim Start gelesen –
Änderungen an der Tabelle wirken nach einem Neustart des Backends.

Staffel: Eine Anlage mit P kWp kostet P × Preis der ersten Zeile mit „bis X“ ≥ P.
Größer als die letzte Zeile (200 kWp): Preis der letzten Zeile (als Annahme gekennzeichnet).
"""
from __future__ import annotations

import logging
import re
from functools import lru_cache
from pathlib import Path

from .cache import DATA_DIR

log = logging.getLogger(__name__)

PATH: Path = DATA_DIR / "Tabelle_Anschaffungskosten_PVprokWp.md"
OPERATING_COST_PCT = 1.0  # laufende Kosten: 1 % der Anschaffungskosten pro Jahr (Vorgabe)

_ROW = re.compile(r"^\|\s*bis\s+([\d.,]+)\s*\|\s*([\d.,]+)\s*\|")


def _num(s: str) -> float:
    return float(s.replace(".", "").replace(",", "."))  # deutsches Zahlenformat


@lru_cache(maxsize=1)
def price_table() -> tuple[tuple[float, float], ...]:
    """((bis_kwp, eur_per_kwp), …) aufsteigend nach Leistung."""
    rows = []
    for line in PATH.read_text(encoding="utf-8").splitlines():
        m = _ROW.match(line.strip())
        if m:
            rows.append((_num(m.group(1)), _num(m.group(2))))
    if not rows:
        raise ValueError(f"Keine Preiszeilen in {PATH} gefunden")
    log.info("Anschaffungskosten: %d Preisstufen (%s–%s €/kWp)", len(rows),
             f"{rows[-1][1]:.0f}", f"{rows[0][1]:.0f}")
    return tuple(sorted(rows))


def price_per_kwp(kwp: float) -> tuple[float, bool]:
    """Preis je kWp für eine Anlage dieser Größe; zweiter Wert: True, wenn außerhalb der Tabelle."""
    table = price_table()
    for limit, price in table:
        if kwp <= limit:
            return price, False
    return table[-1][1], True
