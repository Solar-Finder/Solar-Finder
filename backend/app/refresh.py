"""Lädt externe Daten neu (MaStR → data/cache/, OSM → data/osm/).

Aufruf (im Ordner backend/):  python -m app.refresh [mastr|osm|preis]
"""
import logging
import sys

from .sources import mastr, osm, power_price

logging.basicConfig(level=logging.INFO, format="%(message)s")

what = sys.argv[1] if len(sys.argv) > 1 else "all"
if what in ("all", "mastr"):
    print("MaStR-Anlagen:", len(mastr.load(force=True)["units"]))
if what in ("all", "osm"):
    print("PLZ-Gebiete:", len(osm.load_postal_areas(force=True)["areas"]))
    print("OSM-Solaranlagen:", len(osm.load_solar(force=True)["solar"]))
    print("Gebäude:", len(osm.load_buildings(force=True)["buildings"]))
if what in ("all", "preis"):
    print("Strompreis (ct/kWh):", power_price.load(force=True)["ct_per_kwh"])
print("Fertig – Backend neu starten, damit die Daten übernommen werden.")
