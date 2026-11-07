/** Kartenkonfiguration: Basiskarten, Startausschnitt, Farbklassen. */

export const PFORZHEIM_CENTER = [48.8915, 8.70];
export const DEFAULT_ZOOM = 13;

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

/** Genutztes Potenzial in % → Klassen 1–4 (Legende im Mockup) */
export const UTILIZATION_CLASSES = [
  { max: 25, label: "0–25 %", color: "var(--map-class-1)", hex: "#eef3f8", text: "#142840" },
  { max: 50, label: ">25–50 %", color: "var(--map-class-2)", hex: "#c3d3e2", text: "#142840" },
  { max: 75, label: ">50–75 %", color: "var(--map-class-3)", hex: "#6f93b4", text: "#142840" },
  { max: Infinity, label: ">75–100 %", color: "var(--map-class-4)", hex: "#1e5078", text: "#ffffff" },
];

/** Installierte Leistung je Gebiet in MWp → Klassen (PV-Ansicht „Bestand“) */
export const INSTALLED_CLASSES = [
  { max: 2, label: "0–2 MWp", hex: "#eef3f8", text: "#142840" },
  { max: 4, label: ">2–4 MWp", hex: "#c3d3e2", text: "#142840" },
  { max: 8, label: ">4–8 MWp", hex: "#6f93b4", text: "#142840" },
  { max: Infinity, label: ">8 MWp", hex: "#1e5078", text: "#ffffff" },
];

export const classFor = (classes, value) => classes.find((c) => value <= c.max) ?? classes[classes.length - 1];

/** Farben der Eignungsklassen (Gebäude) – gleiche Reihenfolge wie die Diagramme */
export const SUITABILITY_COLORS = { 1: "#1e5078", 2: "#f0d23c", 3: "#c83737", 6: "#94a3b8" };

/** Kreisgrößen bestehender Anlagen */
export const INSTALLATION_SIZES = [
  { max: 10, label: "bis 10 kWp", radius: 4 },
  { max: 20, label: ">10–20 kWp", radius: 6 },
  { max: Infinity, label: ">20–30 kWp", radius: 8 },
];
