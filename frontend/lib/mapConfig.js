/** Kartenkonfiguration: Basiskarten, Startausschnitt, Farbklassen. */

export const PFORZHEIM_CENTER = [48.8915, 8.70];
export const DEFAULT_ZOOM = 13;

/** Ab dieser Zoomstufe werden einzelne Gebäude geladen (nach Kartenausschnitt) */
export const BUILDINGS_MIN_ZOOM = 15;

export const BASEMAPS = {
  standard: {
    label: "Standard-Map",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
    maxZoom: 19,
  },
  aerial: {
    label: "Luftbild",
    // TODO: für den Produktivbetrieb ggf. amtliche Orthophotos (LGL BW) einbinden
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Luftbild &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};

/** Genutztes Potenzial in % → Klassen (an die realen Werte der PLZ-Gebiete angepasst) */
export const UTILIZATION_CLASSES = [
  { max: 5, label: "0–5 %", hex: "#eef3f8", text: "#142840" },
  { max: 10, label: ">5–10 %", hex: "#c3d3e2", text: "#142840" },
  { max: 15, label: ">10–15 %", hex: "#6f93b4", text: "#142840" },
  { max: Infinity, label: ">15 %", hex: "#1e5078", text: "#ffffff" },
];

/** Installierte Leistung je Gebiet in MWp → Klassen (PV-Ansicht „Bestand“) */
export const INSTALLED_CLASSES = [
  { max: 3, label: "0–3 MWp", hex: "#eef3f8", text: "#142840" },
  { max: 7, label: ">3–7 MWp", hex: "#c3d3e2", text: "#142840" },
  { max: 12, label: ">7–12 MWp", hex: "#6f93b4", text: "#142840" },
  { max: Infinity, label: ">12 MWp", hex: "#1e5078", text: "#ffffff" },
];

export const classFor = (classes, value) => classes.find((c) => value <= c.max) ?? classes[classes.length - 1];

/** Gebäudestatus → Farbe/Beschriftung */
export const SOLAR_STATUS = {
  existing: { label: "Solaranlage vorhanden", hex: "#1e5078" },
  potential: { label: "Ungenutztes Potenzial", hex: "#f0d23c" },
  none: { label: "Nebengebäude / kein nennenswertes Potenzial", hex: "#d1d5db" },
};

/** Farben der Eignungsklassen (sobald LUBW-Daten vorliegen) */
export const SUITABILITY_COLORS = { 1: "#1e5078", 2: "#f0d23c", 3: "#c83737", 6: "#94a3b8" };
