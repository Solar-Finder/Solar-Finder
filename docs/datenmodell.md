# Datenmodell & Berechnungen

Stand: 07.11.2026 · gilt für `backend/app` (API v0.4)

Grundsatz: **Jede Kennzahl stammt entweder direkt aus einer Datenquelle oder ist als
Beispielwert gekennzeichnet** (`data_status = example`). Es gibt keine Schätzung des
Dachpotenzials mehr aus der Gebäudegrundfläche.

---

## 1. Datenquellen

| Quelle | Datei / Abruf | Wofür | Status |
|---|---|---|---|
| **LUBW Solarpotenzial Dachseiten** (Herkunft: „LUBW, Geoplex GIS GmbH“, Jahr 2025, Höhendaten 2016–2023) | `data/8231_Solarpotenzial_Dachseiten_Pforzheim_Stadt/*.shp` (EPSG:25832, 77 645 Dachseiten, 37 522 Gebäude, Stadtkreis Pforzheim 08231) | Gebäude, Dachpotenzial (kWp), Jahresertrag (kWh), CO₂, Eignungsklasse, Dachform | verified |
| **Marktstammdatenregister** | API, Cache 1 Tag | installierte Anlagen (Leistung, Typ, PLZ; Koordinaten nur > 30 kW) | verified |
| **OpenStreetMap** | `data/osm/*.json` (im Git). Nach Ablauf (PLZ-Grenzen/Gebäude 30 Tage, Solaranlagen 7 Tage, gemessen am Feld `retrieved_at`) im Hintergrund über Overpass erneuert, danach wird das Modell neu aufgebaut. Ist Overpass nicht erreichbar (10-s-Verbindungstest), bleibt der vorhandene Stand; PLZ-Grenzen ersatzweise über Nominatim + OSM-API (`relation/{id}/full`) | nur, was LUBW nicht enthält: PLZ-Grenzen, Gebäudename, zusätzlich erfasste Dachanlagen; Gebäudeart nur, wo ALKIS nichts liefert | verified |
| **ALKIS-Gebäudefunktion** (LGL, 3D-Gebäudemodelle LoD2) | [Open GeoData LGL](https://opengeodata.lgl-bw.de), 2-km-Kacheln `LoD2_32_{E}_{N}_2_bw.zip` (CityGML, Attribut `bldg:function`). Einmalig aufbereitet mit `python -m app.refresh alkis` zu `data/alkis/alkis_gebaeudefunktion.json` (LUBW-Gebäude → Funktionscode, im Git). Lizenz **dl-de/by-2-0**, Quellenvermerk „Datenquelle: LGL, www.lgl-bw.de, dl-de/by-2-0“, Codes von uns zu Kategorien zusammengefasst | Gebäudekategorie | verified |
| **Strompreis** | [InfraNode-API](https://infranode.dev/api/v1/cities/pforzheim/power-price) → Bundesnetzagentur \| SMARD.de (CC BY 4.0), Cache 1 Tag (`data/cache/power_price.json`) | Day-Ahead-Großhandelspreis DE/LU als Tageswert (€/MWh ÷ 10 = ct/kWh); Startwert des Reglers im Rechner und Preis im Gebäude-Steckbrief. Kein Endkundenpreis. Ohne Abruf und Cache: Beispielwert 18 ct/kWh (gekennzeichnet) | verified |
| **Anschaffungskosten je Gebäude** | `data/Tabelle_Anschaffungskosten_PVprokWp.md` (Nettopreise nach Größe, Stand 2025) | Gebäude-Steckbrief | Annahme laut Tabelle |
| Wirtschaftlichkeit (Rechner) | Konstanten in `data_service.py` | Investition 900 €/kWp, Stromverbrauch der Stadt | **example** – keine Quelle im Projekt |
| Laufende Kosten | Vorgabe | 1 % der Anschaffungskosten pro Jahr (Rechner und Steckbrief) | Vorgabe |

**Quellenpriorität:** Was der LUBW-Datensatz enthält, kommt aus LUBW – Gebäudeumriss, Grundfläche,
Dachform, Potenzial, Ertrag, CO₂, Eignung. Die Gebäudekategorie kommt aus der amtlichen
ALKIS-Gebäudefunktion (LGL); nur wo keine vorliegt, aus OSM. OSM liefert sonst nur Gebäudenamen,
PLZ-Grenzen und erfasste Anlagen; Umriss und `roof:shape` aus OSM werden nicht übernommen.

## 2. LUBW-Shapefile: verwendete Spalten

Eine Zeile = eine **Dachseite** (`RoofID`) eines Gebäudes (`BuildingID`).

| Spalte | Bedeutung (aus Daten abgeleitet) | verwendet |
|---|---|---|
| `BuildingID` | Gebäude-Schlüssel | ✔ Gruppierung |
| `Eignung` | Eignungsklasse PV der Dachseite (Werte 1, 2, 3, 6, 8, 0) | ✔ |
| `RoofType` | `Spitzdach`, `Flachdach`, `Unbekannt` | ✔ |
| `Aufstd` | 1 = Module aufgeständert (21 501 von 21 542 Fällen Flachdach) | nur Prüfung |
| `Power` | PV-Leistung der Dachseite in kWp (für die von LUBW gewählte Belegung) | ✔ |
| `Yield` | Jahresertrag in kWh/a der Dachseite (passend zu `Power`) | ✔ |
| `CO2Savings` | CO₂-Einsparung in kg/a | ✔ |
| `Area3D` | geneigte Dachfläche in m² (= `Area` ÷ cos(`Slope`), für alle Dachseiten nachgeprüft) | ✔ Steckbrief „Dachfläche“ |
| `PvArea` | PV-Belegungsfläche in m² | ✔ Steckbrief „davon PV-geeignet“ (Klassen 1–3) |
| geometry | Dachseiten-Polygon | ✔ Gebäudeumriss = Vereinigung der Dachseiten |

Nicht verwendet (Varianten bzw. Zwischenwerte): `PvAreaA`, `PvAreaT`, `ErtKwP_K(A)`,
`ErtKwhaK(A)`, `PercentMs(A)`, `Schatten(A)`, `ModuleCoun`, `Irradiatio`, `Slope`, `Aspect`,
`Area` (= Grundfläche der Dachseite, identisch mit `Shape_Area`), `Eignung_T` (vermutlich Solarthermie, nicht dokumentiert), Verwaltungsspalten.

### Im Datensatz nachgeprüfte Zusammenhänge

Geprüft über alle 77 645 Zeilen (Skript-Ergebnisse, keine Annahmen):

- Bei `Aufstd = 0`: `Power = 0,2 kWp/m² × PvArea` und `Yield = ErtKwhaK = Power × ErtKwP_K` (100 %).
- Bei `Aufstd = 1` und Eignung 1–3: `Yield = ErtKwhaKA = Power × ErtKwP_KA` (100 %). `Power` und
  `Yield` beschreiben also immer **dieselbe**, von der LUBW gewählte Belegungsvariante
  (flach bzw. aufgeständert). Deshalb werden nur `Power` und `Yield` addiert und nicht `ErtKwhaK` + `ErtKwhaKA`.
- `Power / ModuleCoun ≈ 0,44–0,45 kWp`. Das passt zum LUBW-Standardmodul mit 440 Wp ([Energieatlas BW – Grundlagen](https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen)).
- `CO2Savings = 0,46 kg/kWh × Yield` für alle Dachseiten der Klassen 1–3.
- Klasse 1–3: `PvArea > 0`, `Yield > 0`, `CO2Savings > 0`; der mittlere spezifische Ertrag sinkt
  mit der Klasse (Ø 1000 / 894 / 782 kWh/kWp).
- Klasse 6: `PvArea = 0`, `ErtKwhaK = 0`, `CO2Savings = 0` → keine PV-Belegungsfläche.
  **Achtung:** `Power` (47,7 MWp) und `Yield` sind hier trotzdem > 0, weil sie aus `PvAreaT`
  berechnet werden. Diese Werte werden **nicht** mitgezählt.
- Klasse 8 (747 Dachseiten): `Slope = -1`, `RoofID = -1`, alle Werte 0 → keine Berechnung vorhanden.
- Klasse 0 (2 Dachseiten): `RoofType = Unbekannt`, alle Werte 0.

> Die verbale Bedeutung der Klassen („sehr gut / gut / bedingt“) ist in der öffentlich gefundenen
> LUBW-Dokumentation nicht beschrieben. Das Frontend zeigt daher „Klasse 1/2/3/6/8/0“ mit den
> oben belegten Eigenschaften. Bitte bei der LUBW bestätigen lassen.

## 3. Aufbereitung (Pipeline)

```
LUBW-Dachseiten ──(repariert, nach BuildingID vereinigt)──► Gebäude (37 522)
                                                            │ Mittelpunkt (representative_point)
OSM-PLZ-Grenzen ────────── Punkt-in-Polygon ───────────────►│ postal_code
OSM-Gebäude ────────────── Punkt-in-Polygon ───────────────►│ name, building_type (category nur als Ersatz)
ALKIS-Grundflächen (LoD2) ─ Punkt-in-Polygon (vorab) ──────►│ alkis_function → category
MaStR-Anlagen (Koord.) ─── im Gebäude / ≤ 25 m ────────────►│ installed_kwp, mastr_ids
OSM-Solaranlagen ───────── im Gebäude / ≤ 25 m ────────────►│ osm_solar
```

Je Gebäude (nur Dachseiten mit Eignung ∈ {1, 2, 3} = „PV-geeignet“):

| Feld | Berechnung |
|---|---|
| `potential_kwp` | Σ `Power` |
| `potential_kwh_per_year` | Σ `Yield` |
| `co2_savings_kg_per_year` | Σ `CO2Savings` |
| `suitability` | beste vorkommende Klasse (Rangfolge 1 › 2 › 3 › 6 › 8 › 0) |
| `roof_type` | `flat` (nur Flachdach), `pitched` (nur Spitzdach), `mixed` (beides), `unknown` |
| `footprint_m2` | Fläche der vereinigten Dachseiten (EPSG:25832) |
| `category` | aus der ALKIS-Gebäudefunktion (siehe Tabelle unten); ohne ALKIS-Treffer aus OSM-Tags (`building`, `amenity`, `shop`, …); sonst `other` |

**ALKIS-Gebäudefunktion → Kategorie** (`alkis.category_for`, Codes laut AdV-Objektartenkatalog):

| Kategorie | ALKIS-Codes |
|---|---|
| Wohngebäude (`residential`) | 31001_1000–1312 (Wohnhaus, Wohnheime, Ferien-/Wochenendhaus …), außer den gemischten und landwirtschaftlichen Codes |
| Wohn- und Geschäftsgebäude (`mixed`) | 31001_1100, 1120–1123, 1130, 1131 (Wohnen mit Handel/Büro/Gewerbe), 2310, 2320 (Handel bzw. Gewerbe mit Wohnen) |
| Öffentliche Gebäude (`public`) | 31001_3000–3299 (Verwaltung, Schule, Kultur, Kirche, Gesundheit, Soziales, Sicherheit, Sport …) |
| Gewerbe & Industrie (`commercial`) | 31001_2000–2699 (Handel, Büro, Hotel, Gaststätte, Fabrik, Werkstatt, Lager, Verkehr, Ver-/Entsorgung), außer Nebengebäuden und Parkbauten |
| Landwirtschaft (`agricultural`) | 31001_1220–1222, 2700–2799 |
| Nebengebäude (`ancillary`) | 31001_1313 Gartenhaus, 2460/2463/2464 Garage/Fahrzeughalle, 2523 Umformer, 2612 Toilette, 2723 Schuppen; 51009_1610/1611 Überdachung/Carport |
| Sonstige (`other`) | Parkhaus/Parkdeck/Tiefgarage (2461, 2462, 2465), Brücken und andere Bauwerke, 9998/9999 |
| `solar_status` | `existing`: MaStR-Anlage zugeordnet oder in OSM erfasst · `potential`: `potential_kwp > 0` · sonst `none` |

## 4. Kennzahlen „Aktueller Stand“

| Kennzahl | Formel | Quelle |
|---|---|---|
| Installierte Leistung (MW) | Σ `power_kwp` aller MaStR-Einheiten in Betrieb | MaStR |
| davon auf Dächern | Σ `power_kwp` mit Anlagentyp **„Gebäudesolaranlage“** | MaStR |
| Potenzielle Leistung (MWp) | Σ `potential_kwp` aller Gebäude (Klassen 1–3) | LUBW |
| Genutztes Potenzial (%) | Dachanlagen ÷ potenzielle Leistung × 100 | MaStR + LUBW |

**Filter beim Einlesen (MaStR):** Es bleiben nur Einheiten mit einer Pforzheimer PLZ (75172–75181).
Einige Einheiten tragen zwar den Gemeindeschlüssel 08231000, aber PLZ und Ort einer Nachbargemeinde
(Stand 07.11.2026: 5 Einheiten, 504 kW, 75449 Wurmberg und 75399 Unterreichenbach). Sie werden verworfen
und fließen in keine Rechnung ein.

Freiflächenanlagen, Balkonkraftwerke und „Sonstige“ sind in der Gesamtleistung enthalten, zählen
aber **nicht** zum genutzten Dachpotenzial, weil die LUBW-Daten nur Dachflächen erfassen.

Je PLZ gilt dasselbe: MaStR nach Anlagen-PLZ, LUBW nach PLZ-Gebiet des Gebäudemittelpunkts.

## 5. Prognose

Eingaben: Ziel-Ausnutzung `p` (%), Zeitraum `T` (Jahre), Strompreis `c` (ct/kWh).

| Größe | Formel | Status |
|---|---|---|
| Ziel-Leistung | `P_ziel = P_potenzial × p / 100` | Daten |
| Neue Leistung | `P_neu = max(P_ziel − P_dach, 0)` | Daten |
| Spez. Ertrag | `y = Σ Yield ÷ Σ Power` (Klassen 1–3), Pforzheim ≈ 963 kWh/kWp | **LUBW** |
| Energieertrag pro Jahr | `E = P_neu × y` | LUBW |
| CO₂-Faktor | `f = Σ CO2Savings ÷ Σ Yield` = 0,46 kg/kWh | **LUBW** |
| CO₂-Einsparung pro Jahr | `E × f` | LUBW |
| Investition | `P_neu × 900 €/kWp` | example |
| Betriebskosten pro Jahr | 1 % der Investition (Vorgabe) | example |
| Stromertrag pro Jahr (€) | `E × c / 100` | Eingabe |
| Amortisation | Investition ÷ (Stromertrag − Betriebskosten) | abgeleitet |
| Anteil am Verbrauch | `E ÷ 300 GWh` | example |

Vereinfachungen: konstante Erträge und Preise, keine Degradation, keine Zinsen, alle neuen
Anlagen gleichzeitig im Jahr 0. Der spezifische Ertrag ist der Mittelwert **aller** geeigneten
Dachflächen. Es wird nicht angenommen, dass zuerst die besten Dächer belegt werden.

**Offen (Quelle nötig):** Investitionskosten im Rechner (900 €/kWp) und Gesamtstromverbrauch
Pforzheim (z. B. aus der Kommunalen Wärmeplanung bzw. von den Stadtwerken).

## 5a. Gebäude-Steckbrief (Klick auf ein Gebäude in der Karte)

Berechnet in `data_service.building_profile`, je Gebäude:

| Wert | Formel / Quelle |
|---|---|
| Installiert | Σ MaStR-Anlagen am Gebäude (nur Anlagen mit Koordinaten, > 30 kW) |
| Potenzial | LUBW Σ `Power`, Klassen 1–3 |
| Genutzt | Installiert ÷ Potenzial × 100, höchstens 100 % (ist die Anlage größer als das LUBW-Potenzial, gilt das Dach als ausgeschöpft) |
| Noch offen | max(Potenzial − Installiert, 0); ohne Anlage = Potenzial |
| Dachfläche / davon PV-geeignet | LUBW Σ `Area3D` (alle Dachseiten) / Σ `PvArea` (Klassen 1–3) |
| Anschaffungskosten | offen × Preis je kWp der Größenstufe von „offen“ aus `data/Tabelle_Anschaffungskosten_PVprokWp.md` (Nettopreise, Stand 2025); über 200 kWp: Preis der Stufe „bis 200“ (810 €/kWp) |
| Laufende Kosten | 1 % der Anschaffungskosten pro Jahr |
| Stromertrag | offen × (Σ `Yield` ÷ Σ `Power`) des Gebäudes |
| Amortisation | Anschaffungskosten ÷ (Stromertrag × Strompreis − laufende Kosten); Strompreis = SMARD Day-Ahead (Tageswert) |
| CO₂-Einsparung | offen × (Σ `CO2Savings` ÷ Σ `Power`) des Gebäudes |

Der Steckbrief hat immer dieselben Zeilen. Ist eine Anlage nur in OpenStreetMap erfasst (Leistung
unbekannt), stehen installierte Leistung, Genutzt, Noch offen und alle Ausbauwerte auf „unbekannt“ – es
werden keine Werte angenommen. Ist nichts mehr auszubauen (Potenzial ausgeschöpft oder kein Potenzial),
stehen die Ausbauwerte auf 0 bzw. „entfällt“. Eine Anlage auf einem Dach ohne LUBW-Potenzial gilt als
zu 100 % genutzt.

## 6. Bekannte Einschränkungen

- MaStR-Anlagen ≤ 30 kW haben keine Koordinaten. Sie fließen in die Summen je PLZ ein, auf der
  Karte erscheinen aber nur Großanlagen und in OSM erfasste Anlagen als „Bestand“.
- Das LUBW-Potenzial ist das technische Gesamtpotenzial. Es zieht bestehende Anlagen nicht ab.
- Gebäude ohne ALKIS- und ohne OSM-Gegenstück erhalten die Kategorie `other`.
