# Prognose-von-Energiegewinnung-durch-Erneuerbare
## Links

### genutzte Daten 

Von lubw ([Enegieatls](https://www.energieatlas-bw.de/sonne/gebaeude/karten?activeLayer=solarkataster):
- [udo.lubw.baden-wuerttemberg.de/...](https://udo.lubw.baden-wuerttemberg.de/projekte/navigatorurl/show?globalId=energie_sonne_dach.energie%3A%24SYSTEM%7BUDO_GEODOWNLOAD_URL%7Denergie%2FPV_Dachflaechenpotenzial.html#)
  - [Erklärung der Daten](https://rips-metadaten.lubw.de/trefferanzeige?docuuid=5ffae6a3-457a-4fea-a8fc-e1baf29f6b18)

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
  - [Infos zu Attributen](https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen#198378)
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
- NExtJs

### Backend
- Python

### Data
- APIs
- lokal: Historische Solaranlagen-Daten
