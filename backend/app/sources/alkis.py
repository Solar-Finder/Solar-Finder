"""Amtliche Gebäudefunktion (ALKIS) aus den 3D-Gebäudemodellen LoD2 des LGL Baden-Württemberg.

Quelle:  LGL Open GeoData, https://opengeodata.lgl-bw.de/data/lod2/LoD2_32_{E}_{N}_2_bw.zip
         (CityGML, 2-km-Kacheln; Grundrisse aus ALKIS; Attribut bldg:function = ALKIS-Gebäudefunktion)
Lizenz:  Datenlizenz Deutschland – Namensnennung – Version 2.0 (dl-de/by-2-0)
Vermerk: „Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0“ – die Funktionscodes werden von uns zu
         Kategorien zusammengefasst (Hinweis auf Veränderung, Lizenz Abs. 3).

Aufbereitung (einmalig, `python -m app.refresh alkis`, lädt einige hundert MB):
1. Kacheln bestimmen, in denen LUBW-Gebäude liegen
2. je Kachel: ZIP laden, CityGML direkt aus dem ZIP lesen (ohne Entpacken), Grundflächen
   (GroundSurface) und Funktion je Gebäude auslesen, ZIP wieder löschen
3. LUBW-Gebäude (Punkt im Umriss) → ALKIS-Gebäude → Funktionscode
Ergebnis: data/alkis/alkis_gebaeudefunktion.json (im Git, klein): {LUBW-Gebäude-ID: Funktionscode}
"""
from __future__ import annotations

import json
import logging
import os
import tempfile
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import date

from .cache import DATA_DIR

log = logging.getLogger(__name__)

ALKIS_DIR = DATA_DIR / "alkis"
PATH = ALKIS_DIR / "alkis_gebaeudefunktion.json"
TILE_URL = "https://opengeodata.lgl-bw.de/data/lod2/LoD2_32_{e}_{n}_2_bw.zip"
USER_AGENT = "pv-prognose-pforzheim/0.2 (Studienprojekt)"
ATTRIBUTION = "Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0"

NS = {"bldg": "http://www.opengis.net/citygml/building/1.0", "gml": "http://www.opengis.net/gml"}
_BUILDING = f"{{{NS['bldg']}}}Building"
_FUNCTION = f"{{{NS['bldg']}}}function"
_GROUND = f"{{{NS['bldg']}}}GroundSurface"
_POSLIST = f"{{{NS['gml']}}}posList"

# ---------------- ALKIS-Gebäudefunktion → Kategorie ----------------
# Codes: AdV-Objektartenkatalog, AX_Gebaeude (31001_xxxx), AX_SonstigesBauwerk… (51009_xxxx),
# AX_BauwerkImVerkehrsbereich (53001_xxxx). Zuordnung zu den Kategorien der Anwendung:
MIXED = {1100, 1120, 1121, 1122, 1123, 1130, 1131, 2310, 2320}  # Wohnen + Handel/Gewerbe
ANCILLARY = {1313, 2460, 2463, 2464, 2523, 2612, 2723}           # Gartenhaus, Garagen, Umformer, Toilette, Schuppen
AGRICULTURAL_HOMES = {1220, 1221, 1222}                          # land-/forstw. Wohn- und Betriebsgebäude, Bauernhaus
PARKING = {2461, 2462, 2465}                                     # Parkhaus, Parkdeck, Tiefgarage → Sonstige
ANCILLARY_STRUCTURES = {1610, 1611}                              # 51009: Überdachung, Carport


def category_for(code: str | None) -> str | None:
    """ALKIS-Funktionscode (z. B. '31001_1010') → Kategorie; None, wenn kein Code vorliegt."""
    if not code:
        return None
    try:
        obj, num = code.split("_", 1)
        n = int(num)
    except ValueError:
        return "other"
    if obj == "51009":
        return "ancillary" if n in ANCILLARY_STRUCTURES else "other"
    if obj != "31001":
        return "other"  # Brücken, Bauwerke im Verkehrsbereich u. a.
    if n in MIXED:
        return "mixed"
    if n in ANCILLARY:
        return "ancillary"
    if n in AGRICULTURAL_HOMES or 2700 <= n <= 2799:
        return "agricultural"
    if n in PARKING:
        return "other"
    if 1000 <= n <= 1312:  # Wohngebäude, Wohnheime, Ferien-/Wochenendhäuser
        return "residential"
    if 2000 <= n <= 2699:  # Handel, Büro, Beherbergung, Gewerbe/Industrie, Verkehr, Ver-/Entsorgung
        return "commercial"
    if 3000 <= n <= 3299:  # öffentliche Zwecke, Bildung, Kultur, Religion, Gesundheit, Soziales, Sport
        return "public"
    return "other"  # 9998 nicht zu spezifizieren, 9999 Sonstiges


# ---------------- Laden (Laufzeit) ----------------
def load() -> dict | None:
    """Aufbereitete Zuordnung oder None, wenn sie noch nicht erzeugt wurde."""
    if not PATH.exists():
        return None
    return json.loads(PATH.read_text(encoding="utf-8"))


# ---------------- Aufbereitung (einmalig) ----------------
def _tiles(points_utm) -> list[tuple[int, int]]:
    """2-km-Kacheln (Ostwert ungerade km, Nordwert gerade km), in denen Punkte liegen."""
    tiles = set()
    for x, y in points_utm:
        e = int(x // 1000)
        n = int(y // 1000)
        tiles.add((e if e % 2 else e - 1, n if n % 2 == 0 else n - 1))
    return sorted(tiles)


def _download(e: int, n: int, folder: str) -> str | None:
    url = TILE_URL.format(e=e, n=n)
    target = os.path.join(folder, f"LoD2_{e}_{n}.zip")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=300) as r, open(target, "wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
    except urllib.error.HTTPError as err:
        if err.code == 404:  # leere Kachel
            return None
        raise
    return target


def _parse_zip(path: str):
    """[(gml_id, funktion, [Polygon in EPSG:25832]), …] aller Gebäude einer Kachel."""
    from shapely.geometry import Polygon

    out = []
    with zipfile.ZipFile(path) as zf:
        for name in zf.namelist():
            if not name.lower().endswith(".gml"):
                continue
            with zf.open(name) as fh:
                depth = 0
                for event, el in ET.iterparse(fh, events=("start", "end")):
                    if el.tag != _BUILDING:
                        continue
                    if event == "start":
                        depth += 1
                        continue
                    depth -= 1
                    if depth:  # verschachteltes Building (kommt in LoD2-BW nicht vor) – äußeres zählt
                        continue
                    func = el.findtext(_FUNCTION)
                    polys = []
                    for ground in el.iter(_GROUND):
                        for pl in ground.iter(_POSLIST):
                            v = [float(t) for t in (pl.text or "").split()]
                            pts = list(zip(v[0::3], v[1::3]))  # 3D → 2D
                            if len(pts) >= 4:
                                p = Polygon(pts)
                                if not p.is_valid:
                                    p = p.buffer(0)
                                if not p.is_empty:
                                    polys.append(p)
                    out.append((el.get(f"{{{NS['gml']}}}id"), func, polys))
                    el.clear()
    return out


def build() -> dict:
    """Lädt die LoD2-Kacheln, ordnet die LUBW-Gebäude zu und schreibt data/alkis/…json."""
    from pyproj import Transformer
    from shapely import STRtree
    from shapely.geometry import Point

    from . import lubw

    lubw_buildings = lubw.load()["buildings"]
    to_utm = Transformer.from_crs(4326, 25832, always_xy=True)
    pts = [to_utm.transform(*b["center"]) for b in lubw_buildings]
    ids = [b["id"] for b in lubw_buildings]

    result: dict[str, str] = {}
    tiles = _tiles(pts)
    log.info("ALKIS/LoD2: %d Kacheln für %d LUBW-Gebäude", len(tiles), len(ids))
    with tempfile.TemporaryDirectory(prefix="lod2_") as tmp:
        for i, (e, n) in enumerate(tiles, 1):
            path = _download(e, n, tmp)
            if not path:
                log.info("[%d/%d] Kachel %d_%d leer", i, len(tiles), e, n)
                continue
            buildings = _parse_zip(path)
            os.remove(path)
            polys, funcs = [], []
            for _gid, func, ps in buildings:
                for p in ps:
                    polys.append(p)
                    funcs.append(func)
            if polys:
                # LUBW-Punkte, die in einer ALKIS-Grundfläche liegen
                idx_pt, idx_poly = STRtree(polys).query([Point(p) for p in pts], predicate="within")
                for a, b in zip(idx_pt, idx_poly):
                    if ids[a] not in result and funcs[b]:
                        result[ids[a]] = funcs[b]
            log.info("[%d/%d] Kachel %d_%d: %d Gebäude, bisher %d LUBW-Gebäude zugeordnet",
                     i, len(tiles), e, n, len(buildings), len(result))

    data = {
        "retrieved_at": date.today().isoformat(),
        "source": "LGL Open GeoData – 3D-Gebäudemodelle LoD2 (bldg:function = ALKIS-Gebäudefunktion)",
        "url": TILE_URL.format(e="{E}", n="{N}"),
        "license": "dl-de/by-2-0",
        "attribution": ATTRIBUTION,
        "matched": len(result),
        "lubw_buildings": len(ids),
        "functions": dict(sorted(result.items())),
    }
    ALKIS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    tmp_path.replace(PATH)
    log.info("ALKIS: %d von %d LUBW-Gebäuden zugeordnet → %s", len(result), len(ids), PATH)
    return data
