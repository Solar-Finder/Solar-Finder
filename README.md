# Prognose-von-Energiegewinnung-durch-Erneuerbare
## Links

### Allgemein 
- https://smartdashboard-pforzheim.vercel.app/klima (City Dashboard Pforzheim)
- https://webtool.klimaatlas-bw.de/viewer/projection-expert#/kreise/8236?measurementType=temperatur-mittelwert (Klimavorhersage bis 2050)
- https://www.pforzheim.de/stadt/aktuelles/pressemeldungen/s1/article/detail/News/kommunale-waermeplanung-stadt-pforzheim-setzt-massstaebe-fuer-energiewende.html
- [BürGER GIS](https://www.enzkreis.de/Landratsamt/%C3%84mter-Dezernate/Dezernat-3-Landwirtschaft-Forsten-%C3%B6ffentliche-Ordnung/Vermessungs-und-Flurneuordnungsamt/Vermessungsamt/B%C3%BCrgerGIS/)
- [daten.bw](https://www.daten-bw.de/)
- [govdata](https://www.govdata.de)
- [PDF - Kommunale Wärmeplanung der Stadt Pforzheim](https://cdn.pforzheim-web.de/fileadmin/user_upload/umwelt/klimaschutz/waermeplanung/2025-09-19_Berichtstext_KWP_Pforzheim_final.pdf)
- [solare-stadt.de](https://www.solare-stadt.de/home/)
- [energieatlas-bw.de](https://www.energieatlas-bw.de/sonne/freiflaechen/karten?activeLayer=eeg-kulisse)
  - [Daten von dieser Seite](https://udo.lubw.baden-wuerttemberg.de/projekte/;jsessionid=2307D6B6F7554EA9CD3FF6D396C689B6)
- [Datensätze Häuser zum Download](https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html)
### APIs
- https://open-meteo.com/en/docs?latitude=48.8844&longitude=8.6989  Wetter API
- https://dwd.api.bund.dev/ Wetterstationsdaten etc.
- https://github.com/bundesAPI/marktstammdaten-api API um Solaranlagen in Pforzheim abzurufen
- https://xapi.niota.io/swagger/v1/#/ Lokale Wetterstationen (Credentials: 2ea01ee4-9907-456d-99f3-db7ac7a7609d)
### Bibliotheken
- https://pvlib-python.readthedocs.io/en/stable/  Simulating the performance of photovoltaic energy systems


## Anforderungsdefintion:

Aktueller Stand:
- Anzeige der installierte Leistung in MW
- Anzeige der potenziellen Leistung in MWp
- Anzeige des genutzten Potenzials in Prozent

Kartenansicht:
  - Alle bekannten bestehenden Anlagen (<30kW) anzeigen (farblich)
  - Alle Gebäude mit scheinbar freiem Potenzial anzeigen (farblich)
  - Auslastung und Potenzial pro Postleitzahlbereich in Prozent
  - Filtern nach Gebäudekategorie
  - Filtern nach Eignungsklassen
  - Standardkarte und Luftbildkarte
  - Diagramme:
      - Pie-Chart: öffentliche Gebäude, private Gebäude, unternehmens-Gebäude
      - Verschiedene Dächertypen

Konfiguration:
  - Einstellung des genutzten Potenzials das erreicht werden soll (Schieberegler - Start bei genutztem Potenzial)
  - Betrachtungszeitraum (Schieberegler 0 - 30 Jahre)
  - Anpassung des Strompreises
 
Prognose: 
  - Neue installierte Leistung in MWp
  - Energieerzeugnis pro Jahr
  - Investition
  - Stromertrag pro Jahr
  - Amortisation (Auf 0)
  - CO2-Ersparung
  - Diagramm:
    - Anteilig wie viel Energieverbrauch gesamt und durch erneuerbaren Energien
    - PV-Zuwachs
    
Design:
- Infofelder
- 3 Bereiche
- Karte im extra Tab über Button 

 Doku:
- Schema der Daten festlegen und für die Zukunft festhalten
- Welche Daten verwendet wurden (Quellen)
- Architektur-Tree
  

## Techstack

### Frontend
- Next.js (JavaScript) in `frontend/` – Seiten „Rechner“ (`/`) und „Karte“ (`/karte`), Karte mit Leaflet
- Design: Figma-Mockups + Corporate Design Stadt Pforzheim (Tokens in `frontend/app/globals.css`)

### Backend
- Python / FastAPI in `backend/` (`backend/app/data_service.py`, räumliche Verknüpfung in `geo_model.py`)
- Schnittstellen-Vertrag: `docs/api/openapi.json` (erzeugt mit `python -m app.export_openapi`), interaktiv unter http://localhost:8000/docs

## Lokal starten (VS Code, Windows)

Es werden **zwei Terminals** benötigt – eins für das Backend, eins für das Frontend.
Neues Terminal: **Terminal → Neues Terminal**, weiteres Terminal über das **+** im Terminal-Bereich.
Die Befehle gelten für PowerShell (Standard in VS Code unter Windows).

**Voraussetzungen:** Python 3.11+ und Node.js 20+

### 1. Backend (Terminal 1)

| Schritt | Ordner | Befehl |
|---|---|---|
| In den Ordner wechseln | Projektordner | `cd backend` |
| Python-Umgebung anlegen *(nur beim ersten Mal)* | `backend` | `python -m venv .venv` |
| Pakete installieren *(nur beim ersten Mal)* | `backend` | `.venv\Scripts\pip install -r requirements.txt` |
| **Backend starten** | `backend` | `.venv\Scripts\python -m uvicorn app.main:app --reload --reload-dir app --timeout-keep-alive 75 --port 8000` |

✅ Läuft, sobald `Application startup complete` erscheint → API-Doku unter http://localhost:8000/docs

> **Erster Start:** Das Backend lädt die Daten aus dem Marktstammdatenregister (ca. 1 Minute)
> und speichert sie in `data/cache/` (nicht im Git). Danach startet es in Sekunden.
> LUBW- und OSM-Daten liegen bereits im Repository (`data/`).

### 2. Frontend (Terminal 2)

| Schritt | Ordner | Befehl |
|---|---|---|
| In den Ordner wechseln | Projektordner | `cd frontend` |
| Pakete installieren *(nur beim ersten Mal)* | `frontend` | `npm install` |
| **Frontend starten** | `frontend` | `npm run dev` |

✅ Danach im Browser öffnen: **http://localhost:3000**

### Gut zu wissen

- **Reihenfolge:** zuerst das Backend starten – sonst zeigt die Website „Daten konnten nicht geladen werden“.
- **Beenden:** im jeweiligen Terminal `Strg + C`.
- **Daten neu laden** (im Ordner `backend`): `.venv\Scripts\python -m app.refresh` – danach Backend neu starten.
- **API-Vertrag neu erzeugen** (im Ordner `backend`): `.venv\Scripts\python -m app.export_openapi` → `docs/api/openapi.json`
- **Fehler „Ausführung von Skripts ist auf diesem System deaktiviert“** bei `npm`: einmalig
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` ausführen – oder im Terminal-Menü (Pfeil neben **+**) auf **Command Prompt** wechseln.
- **Andere Backend-Adresse:** Der Browser ruft das Backend direkt unter Port 8000 auf (CORS). Eine andere Adresse lässt sich mit der Umgebungsvariable `NEXT_PUBLIC_API_URL` setzen. Bewusst kein Next.js-Rewrite-Proxy: Unter Windows kamen größere Antworten darüber abgeschnitten an.

### Data
- **Marktstammdatenregister** (API): alle PV-Anlagen „In Betrieb“ in Pforzheim. Adresse/Koordinaten nur bei Anlagen > 30 kW öffentlich, kleinere nur mit PLZ → nur Großanlagen sind gebäudegenau verortbar. Cache: 1 Tag.
- **LUBW Solarpotenzial Dachflächen** (`data/8231_…/*.shp`): Gebäude, Dachpotenzial (kWp), Jahresertrag, CO₂, Eignungsklasse, Dachform – nur Dachseiten der Klassen 1–3 zählen als Potenzial.
- **ALKIS-Gebäudefunktion** (LGL, 3D-Gebäudemodelle LoD2, `data/alkis/alkis_gebaeudefunktion.json`): Gebäudekategorie. Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (Funktionscodes zu Kategorien zusammengefasst). Neu aufbereiten: `python -m app.refresh alkis` (lädt einige hundert MB).
- **OpenStreetMap** (`data/osm/*.json`, optional): nur, was LUBW und ALKIS nicht enthalten – PLZ-Grenzen, Gebäudenamen, zusätzlich erfasste Dachanlagen; Gebäudeart nur als Ersatz. Der Stand liegt im Git und wird nach 30 Tagen (Solaranlagen: 7 Tage) automatisch im Hintergrund über die Overpass-API erneuert; ist Overpass nicht erreichbar, bleibt der vorhandene Stand. Von Hand: `python -m app.refresh osm`.
- Spezifischer Ertrag (kWh/kWp) und CO₂-Faktor (kg/kWh) stammen aus den LUBW-Daten. Der Strompreis ist der Day-Ahead-Börsenpreis (SMARD, Jahresmittel des letzten abgeschlossenen Jahres), er steigt in der Rechnung um 0,6 ct/kWh pro Jahr; der Ertrag sinkt durch Alterung um 0,25 % pro Jahr (beides Energieatlas BW); die Amortisation rechnet nur mit den Anschaffungskosten; laufende Kosten 1 % der Investition pro Jahr. Investition (Rechner) und Stromverbrauch sind noch Beispielwerte.
- Alle Formeln und die Spaltenbedeutung: [`docs/datenmodell.md`](docs/datenmodell.md)
