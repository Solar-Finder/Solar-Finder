"""Lädt externe Daten neu (MaStR → data/cache/, OSM → data/osm/).

Aufruf (im Ordner backend/):  python -m app.refresh [mastr|osm|preis|alkis]
(alkis lädt die LoD2-Kacheln für Pforzheim, einige hundert MB, und läuft nur auf ausdrücklichen Aufruf)
"""
import logging
import sys

from .sources import alkis, mastr, osm, power_price

logging.basicConfig(level=logging.INFO, format="%(message)s")

what = sys.argv[1] if len(sys.argv) > 1 else "all"
if what in ("all", "mastr"):
    print("MaStR-Anlagen:", len(mastr.load(force=True)["units"]))
if what in ("all", "osm"):
    print("PLZ-Gebiete:", len(osm.load_postal_areas(force=True)["areas"]))
    print("OSM-Solaranlagen:", len(osm.load_solar(force=True)["solar"]))
    print("Gebäude:", len(osm.load_buildings(force=True)["buildings"]))
if what in ("all", "preis"):
    p = power_price.load(force=True); print(f"Strompreis (ct/kWh, Jahresmittel {p['year']}):", p["ct_per_kwh"])
if what == "alkis":  # nicht in "all": großer Download, Daten ändern sich selten
    d = alkis.build()
    print("ALKIS-Gebäudefunktion:", d["matched"], "von", d["lubw_buildings"], "LUBW-Gebäuden zugeordnet")
print("Fertig – Backend neu starten, damit die Daten übernommen werden.")
