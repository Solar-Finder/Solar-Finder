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
### APIs
- https://open-meteo.com/en/docs?latitude=48.8844&longitude=8.6989  Wetter API
- https://dwd.api.bund.dev/ Wetterstationsdaten etc.
- https://github.com/bundesAPI/marktstammdaten-api API um Solaranlagen in Pforzheim abzurufen
- https://xapi.niota.io/swagger/v1/#/ Lokale Wetterstationen (Credentials: 2ea01ee4-9907-456d-99f3-db7ac7a7609d)
### Bibliotheken
- https://pvlib-python.readthedocs.io/en/stable/  Simulating the performance of photovoltaic energy systems


## Anforderungsdefintion:

- Webanwendung
- Interaktives Design (Umschaltung zwischen kwH und Prozent)
- Vorhersage-Perioden:
  - 1 Tag in die Zukunft
  - 10/14 Tage in die Zukunft
  - Das gesamte Jahr
- Angabe in kwH und Prozent vom Gesamtenenergiebedarf (Es werden x% vom Gesamtenergiebedarf durch Solarenergie erzeugt?) => Button zum Umschalten
- Energieerzeugung nicht Netzeinspeisung
- Vorhersage durch ein neuronales Netz

Anzeige:
  - 1 Tag: Zahl in kwH und %
  - 10 Tage: Liniendiagram
  - Ein gesamtes Jahr: Kurvendiagramm (unterteilt in Jahreszeiten, Steckbrief mit Kennzahl für Jahr und Jahreszeiten) (vom aktuellen Monat aus bis zum Jahres Ende)

## Priorisierung
1. 1 Tag Vorhersage in kwH
2. 1 Tag Vorhersage in % vom Gesamtenergiebedarf
3. 10 Tages Vorhersage in kwH (kwH-WErt für jeden Tag)
4. 10 Tages Vorhersage in kwH als Liniendiagramm
5. 10 Tages Vorhersage in % vom Gesamtenergiebedarf
6. Gesamtvorhersage für 1 Kalender Jahr in kWH 
7. Gesamtvorhersage für 1 Kalender Jahr in kWH als Kurvendiagramm (24 Werte: alle 2 Wochen)
----------------------optional--------------------------------------
9. Farbliche Unterteilung des Liniendiagramms in Jahreszeiten
10. Anzeige der Vorhersage pro Jahreszeit
11. Tageswetter
12. Sonnenlichstunden

## Techstack

### Frontend
- NExtJs

### Backend
- Python

### Data
- APIs
- lokal: Historische Solaranlagen-Daten
