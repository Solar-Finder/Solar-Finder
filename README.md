# PV-Prognose Pforzheim

**Prognose der Energiegewinnung durch Photovoltaik auf den Dächern der Stadt Pforzheim**

> ### Hinweis zur Übergabe
>
> Dieses Repository entstand als Hackathonprojekt im Rahmen der Smart City Days Pforzheim und wird der **Stadt Pforzheim** als Grundlage
> zur Verfügung gestellt. Die Anwendung ist ein lauffähiger Prototyp: Die meisten Kennzahlen stammen
> aus amtlichen bzw. offenen Datenquellen, einzelne Werte sind noch Beispielwerte (siehe
> [Datenstand](#7-datenstand-und-offene-punkte)).
>
> **Wir würden das Projekt sehr gerne gemeinsam mit Ihnen weiterführen** – etwa die noch offenen
> Werte durch städtische Daten ersetzen, die Anwendung auf einem städtischen Server bereitstellen
> oder weitere Funktionen nach Ihren Wünschen ergänzen. Sprechen Sie uns gerne an.

---

## Inhalt

1. [Worum geht es?](#1-worum-geht-es)
2. [Die Website](#2-die-website)
3. [Aufbau des Repositorys](#3-aufbau-des-repositorys)
4. [Herkunft der Daten](#4-herkunft-der-daten)
5. [Art der Daten](#5-art-der-daten)
6. [Berechnungen](#6-berechnungen)
7. [Datenstand und offene Punkte](#7-datenstand-und-offene-punkte)
8. [Anwendung starten](#8-anwendung-starten)
9. [Pflege und Erweiterung](#9-pflege-und-erweiterung)
10. [Lizenzen und Quellenvermerke](#10-lizenzen-und-quellenvermerke)
11. [Weiterführende Links](#11-weiterführende-links)

---

## 1. Worum geht es?

Die Anwendung beantwortet drei Fragen:

1. **Wo steht Pforzheim heute?** – Wie viel PV-Leistung ist installiert, wie groß ist das
   Dachpotenzial und welcher Anteil davon ist schon genutzt?
2. **Wo liegt das Potenzial?** – Auf einer Karte wird für jedes Gebäude sichtbar, ob bereits eine
   Anlage vorhanden ist und wie viel Leistung sich noch installieren ließe.
3. **Was bringt ein Ausbau?** – Für ein frei wählbares Ausbauziel werden Investition,
   Stromerzeugung, Gewinn, Amortisation und CO₂-Einsparung überschlägig berechnet.

Technisch besteht die Anwendung aus zwei Teilen:

```
 Browser (Nutzer)
      │  http://localhost:3000
      ▼
┌──────────────────────┐   JSON / GeoJSON   ┌──────────────────────────┐   Abruf / Dateien   ┌──────────────────────┐
│ Frontend             │ ─────────────────► │ Backend                  │ ──────────────────► │ Datenquellen         │
│ Next.js (JavaScript) │  /api/v1/…         │ FastAPI (Python)         │                     │ LUBW, MaStR, ALKIS,  │
│ Seiten Rechner/Karte │ ◄───────────────── │ Datenaufbereitung,       │ ◄────────────────── │ OSM, SMARD,          │
│ Karte mit Leaflet    │                    │ Berechnungen, Kacheln    │                     │ Kartenkacheln        │
└──────────────────────┘                    └──────────────────────────┘                     └──────────────────────┘
                                             http://localhost:8000
```

Das **Backend** liest die Daten ein, verknüpft sie räumlich und rechnet. Das **Frontend** stellt die
Ergebnisse dar. Beide sprechen über eine dokumentierte Schnittstelle (`docs/api/openapi.json`).

---

## 2. Die Website

Die Website hat zwei Bereiche, umschaltbar über die Reiter oben rechts. Das Design folgt dem
Corporate Design der Stadt Pforzheim (Schrift Montserrat, CD-Farben; Farbwerte in
`frontend/app/globals.css`). An vielen Kennzahlen erklärt ein **ⓘ-Symbol**, woher der Wert kommt
und wie er berechnet wird.

### 2.1 Rechner (Startseite `/`)

| Bereich | Inhalt |
|---|---|
| **PV-Übersicht** | Aktuell installierte Leistung (MW), potenzielle Leistung (MWp), gedeckter Anteil des Potenzials (%) |
| **Konfiguration** | Schieberegler für die **Zielauslastung** des Solarpotenzials (startet beim heutigen Stand), den **Betrachtungszeitraum** (bis 30 Jahre) und den **Strompreis** (vorbelegt mit dem aktuellen Börsenpreis, manuell anpassbar) |
| **Überschlagsrechnungen** | Erforderliche Investition, Gewinn nach X Jahren, gesamte Stromerzeugung, Stromerzeugung pro Jahr, Amortisationsdauer, CO₂-Einsparung |
| **Entwicklung im Zeitverlauf** | Diagramm der finanziellen Entwicklung (Saldo über die Jahre mit Amortisationspunkt) und Anteil des Solarstroms am Jahresverbrauch der Stadt |

Jede Änderung an einem Regler löst sofort eine neue Berechnung im Backend aus.

### 2.2 Karte (`/karte`)

**Filter („Kartenansicht“, links, einklappbar):**

- **Postleitzahlgebiete** – ganze Stadt oder ein einzelnes PLZ-Gebiet (75172–75181)
- **Ansicht** – nach PLZ-Gebieten eingefärbt oder einzelne Gebäude
- **PV-Ansicht** – *Potenzial* (wo ist noch Platz?) oder *Bestand* (wo stehen Anlagen?)
- **Basiskarte** – Standard-Map (OpenStreetMap) oder Luftbild
- **Gebäudekategorie** – Wohngebäude, Wohn- und Geschäftsgebäude, öffentliche Gebäude, Gewerbe & Industrie, Landwirtschaft, Nebengebäude, Sonstige
- **Eignungsklassen** – LUBW-Klassen 1, 2, 3 (PV-geeignet), 6, 8, 0

**Kartendarstellung:**

| Ansicht | Darstellung |
|---|---|
| PLZ-Gebiete, *Potenzial* | Einfärbung nach genutztem Potenzial in % (0–5 / 5–10 / 10–15 / > 15 %) |
| PLZ-Gebiete, *Bestand* | Einfärbung nach installierter Leistung in MWp |
| Gebäude, weit herausgezoomt | jedes Gebäude als Punkt (schnelle Übersicht) |
| Gebäude, ab Zoomstufe 15 | Gebäudeumrisse: **blau** = Anlage vorhanden, **schraffiert** = Anlage in OSM erfasst, Leistung unbekannt, **Gelbtöne** = ungenutztes Potenzial (je kräftiger, desto mehr kWp), Punkte = Großanlagen > 30 kW aus dem Marktstammdatenregister |

**Gebäude-Steckbrief:** Ein Klick auf ein Gebäude zeigt installierte Leistung, Potenzial, genutzten
Anteil, Dachfläche, Anschaffungskosten, laufende Kosten, Stromertrag, Amortisation und CO₂-Einsparung
für genau dieses Dach.

**Seitenleiste:** PV-Übersicht für die aktuelle Auswahl sowie Ringdiagramme zu **Dachformen**,
**Gebäudekategorien** und **Eignungsklassen**. Alle Werte reagieren auf die gesetzten Filter.

> **Datenschutz:** Die Kartenkacheln lädt der Browser nicht direkt bei OpenStreetMap bzw. Esri,
> sondern über das eigene Backend. Die Kachelserver erfahren so keine IP-Adressen der Nutzer.

---

## 3. Aufbau des Repositorys

```
.
├── README.md                     ← diese Dokumentation
├── docker-compose.yml            ← startet Backend und Frontend als Container (Abschnitt 8.4)
├── .env.example                  ← Vorlage für Docker-Einstellungen (Domain, Ports)
├── certs/                        ← optionale Zusatz-Zertifikate für den Docker-Build (Virenscanner/Proxy)
├── backend/                      ← Python-Backend (FastAPI)
│   ├── Dockerfile                ← Container-Image des Backends (inkl. data/)
│   ├── requirements.txt          ← Python-Pakete
│   └── app/
│       ├── main.py               ← Einstiegspunkt, alle API-Endpunkte (/api/v1/…)
│       ├── data_service.py       ← Kennzahlen, Prognose, Gebäude-Steckbrief, Konstanten
│       ├── geo_model.py          ← Datenmodell: verknüpft alle Quellen räumlich je Gebäude
│       ├── schemas.py            ← Datenformate der Schnittstelle (Pydantic)
│       ├── refresh.py            ← Daten von Hand neu laden (python -m app.refresh)
│       ├── export_openapi.py     ← erzeugt docs/api/openapi.json
│       └── sources/              ← je Datenquelle ein Modul
│           ├── lubw.py           ←   LUBW-Solarpotenzial (Shapefile)
│           ├── mastr.py          ←   Marktstammdatenregister (API)
│           ├── alkis.py          ←   ALKIS-Gebäudefunktion (LGL, LoD2)
│           ├── osm.py            ←   OpenStreetMap (Overpass-API)
│           ├── power_price.py    ←   Strompreis (SMARD)
│           ├── costs.py          ←   Anschaffungskosten je kWp (Preistabelle)
│           ├── tiles.py          ←   Kartenkacheln über das Backend
│           └── cache.py          ←   Datei-Cache mit Ablaufzeit
├── frontend/                     ← Website (Next.js / React)
│   ├── Dockerfile                ← Container-Image des Frontends
│   ├── package.json              ← JavaScript-Pakete und Startbefehle
│   ├── app/
│   │   ├── layout.js             ← Grundgerüst aller Seiten (Kopfzeile, Schrift)
│   │   ├── globals.css           ← Corporate-Design-Farben und Grundstile
│   │   ├── page.js               ← Seite „Rechner“
│   │   └── karte/page.js         ← Seite „Karte“
│   ├── components/               ← wiederverwendbare Bausteine
│   │   ├── AppHeader.js          ←   Kopfzeile mit Reitern
│   │   ├── MapView.js            ←   Leaflet-Karte, Gebäude, PLZ-Gebiete, Steckbrief
│   │   ├── DotLayer.js           ←   Gebäude als Punkte (Übersicht)
│   │   ├── BalanceChart.js       ←   Diagramm „Finanzielle Entwicklung“
│   │   ├── Donut.js              ←   Ringdiagramme
│   │   ├── RangeSlider.js        ←   Schieberegler
│   │   └── InfoTip.js            ←   ⓘ-Erklärfelder
│   └── lib/
│       ├── api/client.js         ← alle Aufrufe an das Backend
│       ├── mapConfig.js          ← Basiskarten, Startausschnitt, Farbklassen der Karte
│       └── format.js             ← Zahlenformate (deutsch)
├── data/                         ← Datenbestand
│   ├── 8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt/   ← LUBW-Shapefile (im Git)
│   ├── alkis/alkis_gebaeudefunktion.json                 ← aufbereitete ALKIS-Gebäudefunktion (im Git)
│   ├── osm/                       ← OSM-Stand: PLZ-Grenzen, Gebäude, Solaranlagen (im Git)
│   ├── Tabelle_Anschaffungskosten_PVprokWp.md            ← Preistabelle PV-Anlagen
│   └── cache/                     ← automatisch geladene Daten (MaStR, Strompreis, Kacheln) – NICHT im Git
└── docs/
    ├── datenmodell.md            ← ausführliche Beschreibung aller Spalten, Formeln und Prüfungen
    └── api/openapi.json          ← Schnittstellen-Vertrag Backend ↔ Frontend
```

**Die wichtigsten Einstiegspunkte**

| Wenn Sie … | … schauen Sie in |
|---|---|
| eine Formel oder Annahme ändern möchten | `backend/app/data_service.py` (Konstanten am Dateianfang) |
| verstehen möchten, wie die Quellen verknüpft werden | `backend/app/geo_model.py` |
| eine Datenquelle austauschen möchten | `backend/app/sources/` |
| Texte oder Aufbau einer Seite ändern möchten | `frontend/app/page.js` bzw. `frontend/app/karte/page.js` |
| Farben der Karte ändern möchten | `frontend/lib/mapConfig.js` |
| alle Endpunkte sehen möchten | http://localhost:8000/docs (bei laufendem Backend) |

---

## 4. Herkunft der Daten

| Quelle | Herausgeber | Wofür | Bezug | Aktualisierung |
|---|---|---|---|---|
| **Solarpotenzial Dachseiten** | LUBW Landesanstalt für Umwelt Baden-Württemberg (Geoplex GIS GmbH), Stand 2025 | Gebäude, Dachflächen, PV-Potenzial, Ertrag, CO₂, Eignung, Dachform | [LUBW-Download](https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html), liegt in `data/8231_…` | von Hand, bei neuer LUBW-Ausgabe |
| **Marktstammdatenregister (MaStR)** | Bundesnetzagentur | alle PV-Anlagen „in Betrieb“ in Pforzheim | öffentliche MaStR-API | automatisch, Cache 1 Tag |
| **ALKIS-Gebäudefunktion** (3D-Gebäudemodelle LoD2) | LGL – Landesamt für Geoinformation und Landentwicklung BW | Gebäudekategorie (Wohnen, öffentlich, Gewerbe …) | [Open GeoData LGL](https://opengeodata.lgl-bw.de), aufbereitet in `data/alkis/` | von Hand: `python -m app.refresh alkis` |
| **OpenStreetMap** | OSM-Mitwirkende | PLZ-Grenzen, Gebäudenamen, zusätzlich erfasste Dachanlagen; Gebäudeart nur als Ersatz für ALKIS | Overpass-API, Stand in `data/osm/` | automatisch im Hintergrund (30 Tage, Solaranlagen 7 Tage) |
| **Strompreis** | Bundesnetzagentur / SMARD.de | Startwert des Strompreis-Reglers und Preis im Steckbrief | [SMARD-Marktdaten](https://www.smard.de/home/marktdaten) | automatisch, Cache 7 Tage |
| **Preise PV-Anlagen** | Annahme (Komplettpreise netto, Stand 2025) | Anschaffungskosten im Gebäude-Steckbrief | `data/Tabelle_Anschaffungskosten_PVprokWp.md` | von Hand |
| **Annahmen Alterung / Preissteigerung** | Energieatlas BW (LUBW) | −0,25 % Ertrag pro Jahr, +0,6 ct/kWh Strompreis pro Jahr | [Energieatlas BW – Grundlagen](https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen) | Konstanten im Code |
| **Kartenkacheln** | OpenStreetMap, Esri World Imagery | Basiskarte und Luftbild | über das Backend, Cache 7 Tage | automatisch |

**Grundregel bei Überschneidungen:** Was der LUBW-Datensatz enthält (Gebäudeumriss, Dachform,
Potenzial, Ertrag, CO₂, Eignung), kommt aus der LUBW. Die Gebäudekategorie kommt aus der amtlichen
ALKIS-Gebäudefunktion, nur wo diese fehlt aus OSM. OSM ergänzt sonst nur, was in den amtlichen Daten
fehlt.

---

## 5. Art der Daten

### 5.1 Eingangsdaten

| Datensatz | Format | Umfang | Einheit der Zeile |
|---|---|---|---|
| LUBW Solarpotenzial | Esri-Shapefile, Koordinatensystem EPSG:25832 (UTM 32N) | 77 645 Dachseiten, 37 522 Gebäude | eine **Dachseite** |
| MaStR | JSON (API) | alle PV-Einheiten mit Pforzheimer PLZ | eine **Anlage** |
| ALKIS-Gebäudefunktion | JSON (LUBW-Gebäude → ALKIS-Funktionscode) | je LUBW-Gebäude | ein **Gebäude** |
| OSM | JSON (aus Overpass) | PLZ-Polygone, Gebäude, Solaranlagen | Polygon bzw. Objekt |
| Strompreis | JSON (SMARD) | Jahresmittel des Day-Ahead-Preises | ein Wert |

**Verwendete LUBW-Spalten** (Auszug, vollständig in [`docs/datenmodell.md`](docs/datenmodell.md)):

| Spalte | Bedeutung |
|---|---|
| `BuildingID` | Gebäudeschlüssel |
| `Eignung` | Eignungsklasse der Dachseite (1, 2, 3 = PV-geeignet; 6, 8, 0 = nicht geeignet bzw. keine Berechnung) |
| `RoofType` | Spitzdach, Flachdach, unbekannt |
| `Power` | installierbare PV-Leistung der Dachseite (kWp) |
| `Yield` | Jahresertrag der Dachseite (kWh/a) |
| `CO2Savings` | CO₂-Einsparung (kg/a) |
| `Area3D` / `PvArea` | geneigte Dachfläche / PV-Belegungsfläche (m²) |
| `geometry` | Umriss der Dachseite |

**Wichtige Besonderheit des MaStR:** Adresse und Koordinaten sind nur bei Anlagen **über 30 kW**
öffentlich. Kleinere Anlagen sind nur einer Postleitzahl zugeordnet. Sie zählen deshalb in allen
Summen (Stadt, PLZ-Gebiet) mit, lassen sich aber nicht einem bestimmten Gebäude zuordnen.

### 5.2 Aufbereitetes Datenmodell

Beim Start baut das Backend (`geo_model.py`) aus allen Quellen ein Modell **je Gebäude** auf:

```
LUBW-Dachseiten ──(nach BuildingID zusammengefasst)───► Gebäude (37 522)
                                                        │ Mittelpunkt des Gebäudes
OSM-PLZ-Grenzen ─────── Punkt liegt im Polygon ────────►│ Postleitzahl
OSM-Gebäude ─────────── Punkt liegt im Polygon ────────►│ Name, Gebäudeart (Ersatz)
ALKIS (LoD2) ────────── vorab zugeordnet ──────────────►│ Gebäudefunktion → Kategorie
MaStR-Anlagen ───────── im Gebäude oder ≤ 25 m ────────►│ installierte Leistung
OSM-Solaranlagen ────── im Gebäude oder ≤ 25 m ────────►│ Anlage vorhanden (Leistung unbekannt)
```

Je Gebäude stehen dann u. a. bereit: Potenzial (kWp), Jahresertrag (kWh), CO₂-Einsparung, beste
Eignungsklasse, Dachform, Grundfläche, Kategorie, Postleitzahl, installierte Leistung und der
Status *Anlage vorhanden* / *ungenutztes Potenzial* / *kein Potenzial*.

### 5.3 Schnittstelle (API)

Alle Daten liefert das Backend unter `http://localhost:8000/api/v1/`:

| Endpunkt | Inhalt |
|---|---|
| `GET /meta` | Filteroptionen, Datenstand, Quellen |
| `GET /status` | Kennzahlen „Aktueller Stand“ (Stadt oder PLZ) |
| `GET /map/postal-areas` | PLZ-Gebiete als GeoJSON mit Kennzahlen |
| `GET /map/buildings` | Gebäudeumrisse mit Steckbrief (nach Kartenausschnitt) |
| `GET /map/building-points` | alle Gebäude als Punkte |
| `GET /map/installations` | verortete MaStR-Anlagen |
| `GET /stats/roof-types`, `/stats/building-categories`, `/stats/suitability-classes` | Daten der Ringdiagramme |
| `GET /tiles/{standard\|aerial}/{z}/{x}/{y}` | Kartenkacheln |
| `POST /forecast` | Prognose für Zielauslastung, Zeitraum und Strompreis |

Konventionen: Einheit steht im Feldnamen (`_kwp`, `_mwp`, `_pct`, `_eur`, `_ct_per_kwh`, `_mwh`,
`_t`, `_m2`); Geodaten als GeoJSON in WGS84 (`[Längengrad, Breitengrad]`). Jede Antwort trägt einen
Datenstatus (`verified` = aus einer Quelle, `example` = Beispielwert).

---

## 6. Berechnungen

Alle Formeln sind in [`docs/datenmodell.md`](docs/datenmodell.md) mit Quellen und Prüfungen
dokumentiert. Hier die Kurzfassung. Als **PV-Potenzial** zählen nur Dachseiten der LUBW-Klassen
**1, 2 und 3**.

### 6.1 Aktueller Stand

| Kennzahl | Berechnung |
|---|---|
| Installierte Leistung | Summe aller MaStR-Anlagen in Betrieb (inkl. Freiflächen, Balkonkraftwerke) |
| davon auf Dächern | Summe der MaStR-Anlagen vom Typ „Gebäudesolaranlage“ |
| Potenzielle Leistung | Summe `Power` aller geeigneten Dachseiten (LUBW) |
| Genutztes Potenzial | Dachanlagen ÷ potenzielle Leistung × 100 |

Je PLZ-Gebiet gilt dasselbe (MaStR nach Anlagen-PLZ, LUBW nach Lage des Gebäudes).

### 6.2 Prognose (Rechner)

Eingaben: Zielauslastung `p` (%), Zeitraum `T` (Jahre), Strompreis `c` (ct/kWh).

| Größe | Formel |
|---|---|
| Neue Leistung | `P_neu = max(P_potenzial × p/100 − P_dach, 0)` |
| Spezifischer Ertrag | `y = Σ Yield ÷ Σ Power` (LUBW, Pforzheim ≈ 963 kWh/kWp) |
| Ertrag im Jahr t | `E_t = P_neu × y × (1 − 0,25 %)^(t−1)` (Alterung der Module) |
| Strompreis im Jahr t | `c_t = c + 0,6 ct/kWh × (t−1)` |
| Stromwert im Jahr t | `E_t × c_t` |
| Anschaffung | `P_neu × 900 €/kWp` *(Beispielwert)* |
| Instandhaltung | 1 % der Anschaffung pro Jahr |
| Erforderliche Investition | Anschaffung + Instandhaltung × T |
| Gewinn nach T Jahren | Σ Stromwert − Investition |
| Amortisation | Zeitpunkt, ab dem Σ Stromwert ≥ Anschaffung (anteilig im Jahr) |
| CO₂-Einsparung | Σ `E_t` × 0,46 kg/kWh (Faktor aus den LUBW-Daten) |
| Anteil am Verbrauch | Ø Jahresertrag ÷ 300 GWh *(Beispielwert)* |

**Vereinfachungen:** keine Zinsen, alle neuen Anlagen gehen gleichzeitig in Betrieb, der Ertrag
ist der Mittelwert aller geeigneten Dächer (es wird nicht angenommen, dass zuerst die besten Dächer
belegt werden).

### 6.3 Gebäude-Steckbrief (Karte)

| Wert | Berechnung |
|---|---|
| Noch offen | Potenzial − installierte Leistung (mindestens 0) |
| Anschaffungskosten | offene Leistung × Preis je kWp der passenden Größenstufe (Tabelle in `data/`, 1 530 €/kWp bis 3,5 kWp … 810 €/kWp bis 200 kWp) |
| Laufende Kosten | 1 % der Anschaffungskosten pro Jahr |
| Stromertrag | offene Leistung × spezifischer Ertrag **dieses** Daches |
| Amortisation | wie im Rechner, mit SMARD-Strompreis |
| CO₂-Einsparung | offene Leistung × CO₂-Wert **dieses** Daches |

Ist eine Anlage nur in OpenStreetMap erfasst (Leistung unbekannt), zeigt der Steckbrief „unbekannt“ –
es werden keine Werte angenommen.

---

## 7. Datenstand und offene Punkte

| Wert | Stand |
|---|---|
| Gebäude, Potenzial, Ertrag, CO₂ | ✅ amtlich (LUBW) |
| installierte Anlagen | ✅ amtlich (MaStR), Kleinanlagen nur je PLZ |
| Gebäudekategorie | ✅ amtlich (ALKIS), Lücken aus OSM |
| Strompreis | ✅ Börsenpreis (SMARD) – **kein Endkundenpreis**, im Rechner anpassbar |
| Investition im Rechner (900 €/kWp) | ⚠️ Beispielwert – Quelle nötig |
| Stromverbrauch der Stadt (300 GWh/a) | ⚠️ Beispielwert – z. B. aus der Kommunalen Wärmeplanung oder von den Stadtwerken |
| Bedeutung der Eignungsklassen | ⚠️ verbale Beschreibung („sehr gut / gut …“) bei der LUBW noch zu bestätigen |

Hier kann die Stadt mit eigenen Zahlen am meisten verbessern. Die Beispielwerte stehen als
Konstanten am Anfang von `backend/app/data_service.py` und werden in der Oberfläche als Beispiel
gekennzeichnet.

---

## 8. Anwendung starten

Am einfachsten zum Hosten ist der Start mit **Docker** ([8.4](#84-mit-docker-empfohlen-für-den-betrieb-auf-einem-server)).
Für die Entwicklung laufen **zwei Programme gleichzeitig** – das Backend und das Frontend – also werden zwei
Terminals benötigt. Die Befehle gelten für **Windows / PowerShell** (z. B. im Terminal von VS Code:
*Terminal → Neues Terminal*, weiteres Terminal über das **+**).

**Voraussetzungen:** [Python 3.11+](https://www.python.org/downloads/) und
[Node.js 20+](https://nodejs.org/), außerdem Internetzugang beim ersten Start.

### 8.1 Backend (Terminal 1)

| Schritt | Befehl |
|---|---|
| In den Ordner wechseln | `cd backend` |
| Python-Umgebung anlegen *(nur beim ersten Mal)* | `python -m venv .venv` |
| Pakete installieren *(nur beim ersten Mal)* | `.venv\Scripts\pip install -r requirements.txt` |
| **Backend starten** | `.venv\Scripts\python -m uvicorn app.main:app --reload --reload-dir app --timeout-keep-alive 75 --port 8000` |

✅ Läuft, sobald `Application startup complete` erscheint. Die API-Dokumentation ist dann unter
http://localhost:8000/docs erreichbar.

> **Erster Start:** Das Backend lädt die Anlagen aus dem Marktstammdatenregister (ca. 1 Minute) und
> speichert sie in `data/cache/`. Danach startet es in Sekunden. LUBW-, ALKIS- und OSM-Daten liegen
> bereits im Repository.

<details>
<summary>macOS / Linux</summary>

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m uvicorn app.main:app --reload --reload-dir app --timeout-keep-alive 75 --port 8000
```
</details>

### 8.2 Frontend (Terminal 2)

| Schritt | Befehl |
|---|---|
| In den Ordner wechseln | `cd frontend` |
| Pakete installieren *(nur beim ersten Mal)* | `npm install` |
| **Frontend starten** | `npm run dev` |

✅ Danach im Browser öffnen: **http://localhost:3000**

### 8.3 Gut zu wissen

- **Reihenfolge:** zuerst das Backend starten – sonst zeigt die Website „Daten konnten nicht geladen werden“.
- **Beenden:** im jeweiligen Terminal `Strg + C`.
- **Fehler „Ausführung von Skripts ist auf diesem System deaktiviert“** bei `npm`: einmalig
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` ausführen – oder im Terminal auf
  **Command Prompt** wechseln.
- **Andere Backend-Adresse:** Der Browser ruft das Backend direkt unter Port 8000 auf. Eine andere
  Adresse wird über die Umgebungsvariable `NEXT_PUBLIC_API_URL` gesetzt. Für einen Betrieb unter
  einer anderen Domain muss diese außerdem in `backend/app/main.py` bei `allow_origins` (CORS)
  eingetragen werden.
- **Produktivbetrieb:** Frontend mit `npm run build` und `npm run start` statt `npm run dev`;
  Backend ohne `--reload` – oder einfacher mit Docker (8.4).

### 8.4 Mit Docker (empfohlen für den Betrieb auf einem Server)

Backend und Frontend laufen als **zwei getrennte Container**. Benötigt wird nur
[Docker](https://docs.docker.com/get-docker/) (unter Windows: Docker Desktop) – kein Python, kein Node.js.

| Schritt | Befehl |
|---|---|
| Bauen und starten (im Hauptordner) | `docker compose up -d --build` |
| Status ansehen | `docker compose ps` (Backend wird nach ca. 1–3 Minuten `healthy`) |
| Protokoll ansehen | `docker compose logs -f backend` |
| Beenden | `docker compose down` |

✅ Danach: Website **http://localhost:3000**, API-Doku **http://localhost:8000/docs**

| Container | Image | Inhalt | Port |
|---|---|---|---|
| `backend` | `backend/Dockerfile` | FastAPI-Backend mit dem Datenbestand aus `data/` (LUBW, ALKIS, OSM, Preistabelle) | 8000 |
| `frontend` | `frontend/Dockerfile` | Next.js-Website (Produktions-Build) | 3000 |

Automatisch geladene Daten (MaStR, Strompreis, Kartenkacheln) liegen im Docker-Volume
`backend-cache` und überstehen Neustarts. `docker compose down -v` löscht es; die Daten werden dann neu geladen.

**Betrieb unter einer eigenen Domain:** `.env.example` nach `.env` kopieren und anpassen:

| Variable | Bedeutung | Beispiel |
|---|---|---|
| `CORS_ORIGINS` | Adresse(n) der Website, kommagetrennt – nur von dort darf der Browser die API aufrufen | `https://pv.pforzheim.de` |
| `NEXT_PUBLIC_API_URL` | Adresse der API **aus Sicht des Browsers**. Leer = gleicher Hostname wie die Website, Port 8000 | `https://pv-api.pforzheim.de/api/v1` |
| `FRONTEND_PORT`, `BACKEND_PORT` | Ports auf dem Server | `3000`, `8000` |

> `NEXT_PUBLIC_API_URL` wird beim **Bauen** in das Frontend eingebaut. Nach einer Änderung
> `docker compose up -d --build` ausführen.

Typischer Aufbau auf einem Server: ein Reverse-Proxy (z. B. nginx, Traefik, Caddy) übernimmt HTTPS
und leitet die Website-Domain auf Port 3000 und die API-Domain auf Port 8000 weiter.

**Daten im Container neu laden:** `docker compose exec backend python -m app.refresh`
(bzw. `… refresh mastr`), danach `docker compose restart backend`. Ein neuer LUBW-Datensatz wird in
`data/` abgelegt und mit `docker compose up -d --build` in das Image übernommen.

> **Hinweis bei Virenscannern mit HTTPS-Prüfung** (z. B. Norton, Kaspersky, Firmen-Proxys): Schlägt
> der Build bei `pip install` oder `npm ci` mit einem Zertifikatsfehler fehl
> (`CERTIFICATE_VERIFY_FAILED`, `SELF_SIGNED_CERT_IN_CHAIN`), bricht der Scanner die Verbindung auf.
> Dann das Stammzertifikat des Scanners als `.crt` in den Ordner `certs/` legen und neu bauen –
> Anleitung in [`certs/README.md`](certs/README.md).

---

## 9. Pflege und Erweiterung

Alle Befehle im Ordner `backend`:

| Aufgabe | Befehl |
|---|---|
| alle automatisch beziehbaren Daten neu laden (MaStR, OSM, Strompreis) | `.venv\Scripts\python -m app.refresh` |
| nur eine Quelle neu laden | `.venv\Scripts\python -m app.refresh mastr` (bzw. `osm`, `preis`) |
| ALKIS-Gebäudefunktion neu aufbereiten (lädt einige hundert MB) | `.venv\Scripts\python -m app.refresh alkis` |
| Schnittstellen-Vertrag neu erzeugen | `.venv\Scripts\python -m app.export_openapi` → `docs/api/openapi.json` |

Nach dem Neuladen das Backend neu starten.

**Neuer LUBW-Datensatz:** Shapefile im selben Aufbau ablegen und entweder den Pfad in
`backend/app/sources/lubw.py` anpassen oder die Umgebungsvariable `PV_POTENTIAL_PATH` auf die
`.shp`-Datei setzen.

**Ideen für die Weiterentwicklung:**

- Beispielwerte (Investition, Stromverbrauch) durch städtische Daten ersetzen
- amtliche Luftbilder (Orthophotos des LGL) statt Esri einbinden
- Bereitstellung auf einem städtischen Server, Einbindung in das Smart-City-Dashboard
- weitere erneuerbare Energien (z. B. Solarthermie, Freiflächen)
- Export der Ergebnisse (PDF/CSV) für Gremien und Bürgerinformation

---

## 10. Lizenzen und Quellenvermerke

| Daten | Vermerk |
|---|---|
| LUBW Solarpotenzial | © LUBW Landesanstalt für Umwelt Baden-Württemberg |
| ALKIS-Gebäudefunktion | Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0 (Funktionscodes zu Kategorien zusammengefasst) |
| Marktstammdatenregister | © Bundesnetzagentur |
| Strompreis | Bundesnetzagentur \| SMARD.de, CC BY 4.0 |
| OpenStreetMap | © OpenStreetMap-Mitwirkende, ODbL |
| Luftbild | © Esri, Maxar, Earthstar Geographics |

Die Quellenvermerke werden in der Karte angezeigt (`frontend/lib/mapConfig.js`).

---

## 11. Weiterführende Links

**Daten und Hintergrund**

- [Energieatlas BW – Solarkataster](https://www.energieatlas-bw.de/sonne/gebaeude/karten?activeLayer=solarkataster)
- [Energieatlas BW – Grundlagen und Attribute](https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen)
- [LUBW – Metadaten zum Datensatz](https://rips-metadaten.lubw.de/trefferanzeige?docuuid=5ffae6a3-457a-4fea-a8fc-e1baf29f6b18)
- [LUBW – Download Dachflächenpotenzial](https://udo.lubw.baden-wuerttemberg.de/projekte-hilfe/download/energie/PV_Dachflaechenpotenzial.html)
- [Marktstammdatenregister-API](https://github.com/bundesAPI/marktstammdaten-api)
- [Open GeoData LGL](https://opengeodata.lgl-bw.de)
- [SMARD-Marktdaten](https://www.smard.de/home/marktdaten)

**Stadt Pforzheim und Region**

- [Smart Dashboard Pforzheim – Klima](https://smartdashboard-pforzheim.vercel.app/klima)
- [Kommunale Wärmeplanung Pforzheim (Bericht, PDF)](https://cdn.pforzheim-web.de/fileadmin/user_upload/umwelt/klimaschutz/waermeplanung/2025-09-19_Berichtstext_KWP_Pforzheim_final.pdf)
- [Klimaatlas BW – Klimaprojektion](https://webtool.klimaatlas-bw.de/viewer/projection-expert#/kreise/8236?measurementType=temperatur-mittelwert)
- [BürgerGIS Enzkreis](https://www.enzkreis.de/Landratsamt/%C3%84mter-Dezernate/Dezernat-3-Landwirtschaft-Forsten-%C3%B6ffentliche-Ordnung/Vermessungs-und-Flurneuordnungsamt/Vermessungsamt/B%C3%BCrgerGIS/)
- [daten.bw](https://www.daten-bw.de/) · [GovData](https://www.govdata.de)

**Mögliche Erweiterungen**

- [Open-Meteo](https://open-meteo.com/en/docs?latitude=48.8844&longitude=8.6989) – Wetter- und Einstrahlungsdaten
- [DWD-API](https://dwd.api.bund.dev/) – Wetterstationsdaten
- [pvlib](https://pvlib-python.readthedocs.io/en/stable/) – Simulation von PV-Anlagen
