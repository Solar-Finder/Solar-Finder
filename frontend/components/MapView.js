"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import DotLayer from "./DotLayer";
import {
  BASEMAPS,
  DATA_ATTRIBUTION,
  DEFAULT_ZOOM,
  INSTALLED_CLASSES,
  PFORZHEIM_CENTER,
  POTENTIAL_KWP_CLASSES,
  SOLAR_STATUS,
  UTILIZATION_CLASSES,
  classFor,
  potentialColor,
} from "@/lib/mapConfig";
import { fmtFlex, fmtInt } from "@/lib/format";
import styles from "./MapView.module.css";

const STATUS_EXISTING = 1; // Statuscode der Punktliste für „Anlage vorhanden“

/**
 * Dächer ohne Anlage nach Eignungsklasse filtern. Dächer mit Anlage (blau) werden unabhängig
 * von der Klassenauswahl immer gezeigt und liegen oben.
 * suitability: ausgewählte Klassen oder null (= keine Filterung)
 */
const showsRoof = (solarStatus, cls, suitability) =>
  solarStatus === "existing" || !suitability || suitability.includes(cls);

/** Punkte nach Farbstufe der installierbaren Leistung gruppieren; kräftigere Stufen liegen oben. */
function dotGroups(points, suitability) {
  const byColor = new Map(POTENTIAL_KWP_CLASSES.map((c) => [c.hex, []]));
  const existing = [];
  for (const [lon, lat, status, cls, kwp] of points) {
    if (status === STATUS_EXISTING) existing.push([lon, lat]);
    else if (showsRoof(null, cls, suitability)) byColor.get(potentialColor(kwp)).push([lon, lat]);
  }
  return [
    ...POTENTIAL_KWP_CLASSES.map((c) => ({ color: c.hex, points: byColor.get(c.hex) })),
    // Bestand größer, damit er zwischen den Potenzial-Punkten auffällt
    { color: SOLAR_STATUS.existing.hex, scale: 1.35, points: existing },
  ];
}

// Zusätzliche Kartenebenen (z-Index): overlayPane = 400, Marker = 600, Tooltips = 650
const PANES = { buildingDots: 420, plants: 640 };

/**
 * Legt Leaflet-Panes einmalig an – schon beim Rendern, damit Layer sie beim Hinzufügen vorfinden.
 * Die Panes selbst lassen Mausereignisse durch: Sonst legt sich z. B. die Zeichenfläche der
 * Großanlagen über die ganze Karte und fängt die Klicks auf Gebäude ab (preferCanvas).
 * Anklickbar bleiben nur die interaktiven Elemente darin (SVG-Pfade mit pointer-events: auto).
 */
function EnsurePanes({ panes }) {
  const map = useMap();
  useState(() => {
    for (const [name, z] of Object.entries(panes)) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(z);
      pane.style.pointerEvents = "none";
    }
  });
  return null;
}

/**
 * Leaflet-Karte. Wird nur im Browser geladen (dynamic import, ssr: false).
 * props: basemap, view ('postal'|'buildings'), pvView ('potential'|'existing'),
 *        postalAreas, buildings (Grundrisse, ab Zoom 15), buildingPoints (Punkte, darunter),
 *        installations, selectedPostalCode, labels,
 *        suitability – ausgewählte Eignungsklassen; blendet nur Dächer ohne Anlage aus
 *        (gefärbt werden diese nach installierbarer Leistung, siehe POTENTIAL_KWP_CLASSES),
 *        onViewChange({ bbox, zoom }) – meldet den sichtbaren Ausschnitt (für das Nachladen von Gebäuden)
 * Ebenen (unten → oben): Karte, PLZ, Gebäude, Großanlagen (eigene Pane, immer im Vordergrund)
 * Legende und Hinweise liegen als Overlays in der Seite (siehe app/karte/page.js).
 */
export default function MapView({
  basemap, view, pvView, postalAreas, buildings, buildingPoints, installations, selectedPostalCode, labels, suitability,
  onViewChange,
}) {
  const tiles = BASEMAPS[basemap] ?? BASEMAPS.standard;
  const groups = useMemo(() => buildingPoints && dotGroups(buildingPoints, suitability), [buildingPoints, suitability]);
  const visibleBuildings = useMemo(
    () =>
      buildings && {
        ...buildings,
        features: buildings.features.filter((f) => showsRoof(f.properties.solar_status, f.properties.suitability, suitability)),
      },
    [buildings, suitability]
  );

  return (
    <MapContainer
      center={PFORZHEIM_CENTER}
      zoom={DEFAULT_ZOOM}
      zoomControl={false}
      zoomSnap={0.25}
      zoomDelta={0.5}
      className={styles.map}
      scrollWheelZoom
      preferCanvas
    >
      <TileLayer
        key={basemap}
        url={tiles.url}
        attribution={`${tiles.attribution} | ${DATA_ATTRIBUTION}`}
        maxZoom={tiles.maxZoom}
      />

      {view === "postal" && postalAreas && (
        <PostalLayer data={postalAreas} pvView={pvView} selected={selectedPostalCode} aerial={basemap === "aerial"} />
      )}

      {/* Eigene Ebenen: Großanlagen liegen immer über Gebäuden und PLZ-Flächen */}
      <EnsurePanes panes={PANES} />

      {view === "buildings" && postalAreas && <PostalOutline data={postalAreas} selected={selectedPostalCode} />}
      {view === "buildings" && visibleBuildings && <BuildingLayer data={visibleBuildings} labels={labels} />}
      {view === "buildings" && !buildings && groups && <DotLayer groups={groups} pane="buildingDots" />}
      {view === "buildings" && installations && <InstallationLayer data={installations} />}

      <AutoResize />
      <ViewReporter onViewChange={onViewChange} />
      <FitBounds data={postalAreas} selected={selectedPostalCode} />
      <MapTools fitData={postalAreas} selected={selectedPostalCode} />
    </MapContainer>
  );
}

/* ---------- PLZ-Gebiete (Flächenfarbe nach Auslastung bzw. Bestand) ---------- */
function PostalLayer({ data, pvView, selected, aerial }) {
  // Bei kleinem Maßstab nur die PLZ beschriften, sonst überlappen die Texte
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const [zoom, setZoom] = useState(() => map.getZoom());
  const compact = zoom < 13.25 && !selected;
  const key = useMemo(() => `${pvView}-${selected}-${aerial}-${data.features.map((f) => f.id).join()}`, [data, pvView, selected, aerial]);
  const cls = (p) =>
    pvView === "existing" ? classFor(INSTALLED_CLASSES, p.installed_power_mwp) : classFor(UTILIZATION_CLASSES, p.utilization_pct);

  return (
    <>
      <GeoJSON
        key={key}
        data={data}
        style={(f) => {
          const dim = selected && f.properties.postal_code !== selected;
          return {
            color: dim ? "#ffffff" : "#1e5078",
            weight: !dim && selected ? 3 : 1.5,
            fillColor: cls(f.properties).hex,
            fillOpacity: dim ? 0.2 : aerial ? 0.72 : 0.82,
          };
        }}
        onEachFeature={(f, layer) => {
          const p = f.properties;
          layer.bindTooltip(
            `<strong>PLZ ${escapeHtml(p.postal_code)}</strong><br/>` +
              `${fmtFlex(p.installed_power_mwp, 1)} MWp installiert · ${fmtInt(p.installation_count)} Anlagen<br/>` +
              `davon ${fmtInt(p.located_installation_count)} gebäudegenau verortet, ${fmtInt(p.balcony_count)} Balkonkraftwerke<br/>` +
              `Potenzial ca. ${fmtFlex(p.potential_power_mwp, 0)} MWp · ${fmtFlex(p.utilization_pct, 1)} % genutzt`,
            { sticky: true }
          );
        }}
      />
      {data.features.map((f) => {
        const p = f.properties;
        if (selected && p.postal_code !== selected) return null;
        // Zu kleine Flächen (in Pixeln) nicht beschriften – Infos dann per Tooltip
        const bnds = L.geoJSON(f).getBounds();
        const pxWidth = map.latLngToContainerPoint(bnds.getNorthEast()).x - map.latLngToContainerPoint(bnds.getSouthWest()).x;
        if (pxWidth < (compact ? 100 : 150)) return null;
        const c = cls(p);
        const [lon, lat] = p.label_point ?? centroid(f.geometry);
        const value = pvView === "existing" ? `${fmtFlex(p.installed_power_mwp, 1)} MWp installiert` : `${fmtFlex(p.utilization_pct, 1)} % genutzt`;
        const short = pvView === "existing" ? `${fmtFlex(p.installed_power_mwp, 1)} MWp` : `${fmtFlex(p.utilization_pct, 1)} %`;
        const icon = L.divIcon({
          className: `${styles.areaLabel} ${compact ? styles.areaLabelCompact : ""}`,
          html: `<span style="color:${c.text}">${escapeHtml(p.postal_code)}<br/>${escapeHtml(compact ? short : value)}</span>`,
          iconSize: compact ? [80, 34] : [160, 46],
          iconAnchor: compact ? [40, 17] : [80, 23],
        });
        return <Marker key={`${f.id}-${pvView}-${compact}`} position={[lat, lon]} icon={icon} interactive={false} keyboard={false} />;
      })}
    </>
  );
}

/* ---------- PLZ-Umrisse in der Gebäudeansicht ---------- */
function PostalOutline({ data, selected }) {
  const key = useMemo(() => `${selected}-${data.features.length}`, [data, selected]);
  return (
    <GeoJSON
      key={key}
      data={data}
      interactive={false}
      style={(f) => {
        const active = selected && f.properties.postal_code === selected;
        return { color: "#1e5078", weight: active ? 3 : 1, opacity: active ? 0.9 : 0.45, fill: false, dashArray: active ? null : "4 4" };
      }}
    />
  );
}

/* ---------- Gebäude (Solaranlage vorhanden / ungenutztes Potenzial) ---------- */
function BuildingLayer({ data, labels }) {
  const map = useMap();
  const key = useMemo(() => data.features.map((f) => f.id).join(), [data]);
  const geoRef = useRef(null);
  const selected = useRef(null); // angeklicktes Gebäude (für die Hervorhebung)

  const unselect = (layer) => {
    if (selected.current !== layer) return; // inzwischen ein anderes Gebäude gewählt
    if (geoRef.current?.hasLayer(layer)) geoRef.current.resetStyle(layer);
    selected.current = null;
  };

  // Steckbrief als eigenständiges Popup auf der Karte – nicht an den Layer gebunden, damit es
  // offen bleibt, wenn die Gebäude nach dem Verschieben (autoPan) neu geladen werden.
  const openProfile = (f, layer, latlng) => {
    map.closePopup(); // vorheriges Popup schließen → hebt dessen Hervorhebung auf
    selected.current = layer;
    layer.setStyle({ color: "#163c5a", weight: 2.5 });
    layer.bringToFront();
    L.popup({ className: styles.profilePopup, maxWidth: 280, minWidth: 236, autoPanPadding: [16, 16] })
      .setLatLng(latlng)
      .setContent(buildingProfileHtml(f.properties, labels))
      .on("remove", () => unselect(layer))
      .openOn(map);
  };

  return (
    <GeoJSON
      key={key}
      ref={geoRef}
      data={data}
      style={(f) => {
        const existing = f.properties.solar_status === "existing";
        // Anlage bekannt, Leistung aber nicht (nur in OpenStreetMap erfasst): blau schraffiert + gestrichelt
        if (existing && f.properties.profile && !f.properties.profile.installed_known) {
          return { color: SOLAR_STATUS.existing.hex, weight: 1.5, dashArray: "4 3", fillColor: hatchPattern(), fillOpacity: 1 };
        }
        return {
          color: existing ? "#0f2c44" : "#ffffff",
          weight: existing ? 1.2 : 0.6,
          // Mit Anlage immer blau; ohne Anlage Farbstufe nach installierbarer Leistung (Heatmap)
          fillColor: existing ? SOLAR_STATUS.existing.hex : potentialColor(f.properties.potential_kwp),
          fillOpacity: 0.9,
        };
      }}
      onEachFeature={(f, layer) => {
        layer.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openProfile(f, layer, e.latlng);
        });
      }}
    />
  );
}

/**
 * Schraffur (weiße Diagonalen auf Blau) als Füllung für Gebäude mit Anlage, aber unbekannter Leistung.
 * Leaflets Canvas-Renderer übergibt fillColor direkt an ctx.fillStyle – ein CanvasPattern ist dort gültig.
 */
let hatch = null;
function hatchPattern() {
  if (hatch) return hatch;
  const size = 8;
  const tile = document.createElement("canvas");
  tile.width = tile.height = size;
  const ctx = tile.getContext("2d");
  ctx.fillStyle = SOLAR_STATUS.existing.hex;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  // Diagonale plus Ecken, damit die Streifen über Kachelgrenzen durchlaufen
  ctx.moveTo(0, size); ctx.lineTo(size, 0);
  ctx.moveTo(-1, 1); ctx.lineTo(1, -1);
  ctx.moveTo(size - 1, size + 1); ctx.lineTo(size + 1, size - 1);
  ctx.stroke();
  hatch = ctx.createPattern(tile, "repeat");
  return hatch;
}

/* ---------- Steckbrief beim Anklicken eines Gebäudes ----------
   Werte und Formeln kommen aus dem Backend (data_service.building_profile). */
const kwp = (v) => `${fmtFlex(v, 1)} kWp`;
const eur = (v) => `${fmtInt(v)} €`;

function buildingProfileHtml(p, labels) {
  const pr = p.profile ?? {};
  const existing = p.solar_status === "existing";
  const row = (label, value, strong = false) =>
    `<div class="${styles.profileRow}"><span>${escapeHtml(label)}</span>` +
    `<span class="${strong ? styles.profileStrong : ""}">${escapeHtml(value)}</span></div>`;
  const section = (title, rows) =>
    rows.length ? `<div class="${styles.profileSection}">${escapeHtml(title)}</div>${rows.join("")}` : "";

  const subtitle = [p.name, labels.categories[p.category] ?? p.category].filter(Boolean).join(" · ");
  const head =
    `<div class="${styles.profileHead}">` +
    `<i style="background:${(SOLAR_STATUS[p.solar_status] ?? SOLAR_STATUS.none).hex}"></i>` +
    `<strong>${escapeHtml(SOLAR_STATUS[p.solar_status]?.label ?? "Gebäude")}</strong></div>` +
    (subtitle ? `<div class="${styles.profileSub}">${escapeHtml(subtitle)}</div>` : "");

  // Einheitliches Raster: jede Zeile erscheint immer. Fehlt ein Wert (z. B. Anlage nur in
  // OpenStreetMap erfasst → Leistung unbekannt), steht dort „unbekannt“ – es wird nichts angenommen.
  const UNKNOWN = "unbekannt";
  const val = (v, fmt) => (v == null ? UNKNOWN : fmt(v));
  const unknownStock = existing && !pr.installed_known;
  const nothingToBuild = !unknownStock && pr.open_kwp === 0; // Potenzial ausgeschöpft bzw. nicht vorhanden
  const build = (v, fmt, none = fmt(0)) => (unknownStock ? UNKNOWN : nothingToBuild ? none : val(v, fmt));

  const stock = existing
    ? [
        row("Installiert", unknownStock ? UNKNOWN : kwp(p.installed_kwp), true),
        row("Potenzial", kwp(p.potential_kwp)),
        row("Genutzt", val(pr.utilization_pct, (v) => `${fmtFlex(v, 1)} %`)),
        row("Noch offen", val(pr.open_kwp, kwp), true),
      ]
    : [];

  const roof = [
    ...(existing ? [] : [row("Potenzial", kwp(p.potential_kwp), true)]),
    row("Dachfläche", val(pr.roof_area_m2, (v) => `${fmtInt(v)} m²`)),
    row("davon PV-geeignet", val(pr.pv_area_m2, (v) => `${fmtInt(v)} m²`)),
    row("Eignung", labels.suitability?.[p.suitability] ?? UNKNOWN),
  ];

  const amortization = unknownStock
    ? UNKNOWN
    : nothingToBuild
      ? "entfällt"
      : pr.amortization_years == null
        ? "nicht erreicht"
        : `${fmtFlex(pr.amortization_years, 1)} Jahre`;
  const expansion = [
    row("Anschaffungskosten", build(pr.investment_eur, eur), true),
    row("je kWp", build(pr.price_eur_per_kwp, (v) => `${fmtInt(v)} €/kWp`, "entfällt")),
    row("Laufende Kosten", build(pr.operating_cost_eur_per_year, (v) => `${eur(v)}/Jahr`)),
    row("Stromertrag", build(pr.energy_kwh_per_year, (v) => `${fmtInt(v)} kWh/Jahr`)),
    row("Amortisation", amortization, true),
    row("CO₂-Einsparung", build(pr.co2_savings_kg_per_year, (v) => `${fmtFlex(v / 1000, 1)} t/Jahr`)),
  ];

  const notes = [];
  if (nothingToBuild) {
    notes.push(existing ? "Potenzial laut LUBW bereits ausgeschöpft" : "Keine PV-geeignete Dachfläche laut LUBW");
  }
  notes.push(
    `Preise laut Tabelle (Stand 2025) · laufende Kosten ${fmtFlex(pr.operating_cost_pct, 1)} % der Anschaffung/Jahr · ` +
      `Strompreis ${fmtFlex(pr.electricity_price_ct_per_kwh, 1)} ct/kWh ` +
      (pr.electricity_price_is_example ? "(Beispiel)" : "(Börsenpreis SMARD, Tageswert)")
  );

  return (
    `<div class="${styles.profile}">${head}` +
    section("Bestand", stock) +
    section("Dach", roof) +
    section(existing ? "Erweiterung auf volles Potenzial" : "Ausbau auf volles Potenzial", expansion) +
    notes.map((n) => `<div class="${styles.profileFoot}">${escapeHtml(n)}</div>`).join("") +
    `<div class="${styles.profileFoot}">PLZ ${escapeHtml(p.postal_code ?? "–")}</div>` +
    `</div>`
  );
}

/* ---------- Verortete MaStR-Anlagen (> 30 kW) ----------
   Ein Punkt je Gebäude (mehrere Anlagen auf einem Dach werden zusammengefasst),
   zentriert auf dem zugeordneten Gebäude, in eigener Pane über allen anderen Ebenen. */
function InstallationLayer({ data }) {
  // In der Stadtübersicht kleinere Punkte, damit die Gebäudefarben sichtbar bleiben
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const [zoom, setZoom] = useState(() => map.getZoom());
  const scale = zoom < 13 ? 0.55 : zoom < 14.5 ? 0.75 : 1;
  const groups = useMemo(() => {
    const byKey = new Map();
    for (const f of data.features) {
      const p = f.properties;
      const key = p.building_id ?? f.id;
      const [lon, lat] = p.building_point ?? f.geometry.coordinates;
      const g = byKey.get(key) ?? { key, lat, lon, kwp: 0, units: [] };
      g.kwp += p.power_kwp;
      g.units.push({ id: f.id, ...p });
      byKey.set(key, g);
    }
    // kleine zuletzt zeichnen, damit sie bei Überlappung nicht von großen verdeckt werden
    return [...byKey.values()].sort((a, b) => b.kwp - a.kwp);
  }, [data]);
  // SVG statt Canvas: nur die Kreise selbst fangen Klicks/Hover ab, nicht die ganze Fläche
  const renderer = useMemo(() => L.svg({ pane: "plants" }), []);

  return groups.map((g) => {
    const radius = (g.kwp > 500 ? 9 : g.kwp > 100 ? 7 : 5.5) * scale;
    const first = g.units[0];
    return (
      <CircleMarker
        key={g.key}
        pane="plants"
        renderer={renderer}
        center={[g.lat, g.lon]}
        radius={radius}
        pathOptions={{ color: "#ffffff", weight: scale < 1 ? 1.2 : 2, fillColor: "#c83737", fillOpacity: 1 }}
      >
        <Tooltip>
          <strong>
            {fmtFlex(g.kwp, 1)} kWp{g.units.length > 1 ? ` · ${g.units.length} Anlagen` : ""}
          </strong>
          {first.street && (
            <div>
              {first.street} {first.house_number ?? ""}, {first.postal_code}
            </div>
          )}
          {g.units.map((u) => (
            <div key={u.id}>
              {g.units.length > 1 ? `${fmtFlex(u.power_kwp, 1)} kWp · ` : ""}
              {u.plant_type ?? "Solaranlage"}
              {u.commissioned_on ? ` · seit ${u.commissioned_on.slice(0, 4)}` : ""}
            </div>
          ))}
        </Tooltip>
      </CircleMarker>
    );
  });
}

/* ---------- Ausschnitt melden (für das Nachladen) ---------- */
/** Passt die Karte an, wenn sich ihr Container ändert (z. B. Filter ein-/ausgeklappt). */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function ViewReporter({ onViewChange }) {
  const map = useMapEvents({
    moveend: () => report(),
    zoomend: () => report(),
  });
  const report = () => {
    if (!onViewChange) return;
    const b = map.getBounds();
    onViewChange({
      zoom: map.getZoom(),
      bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((v) => v.toFixed(5)).join(","),
    });
  };
  useEffect(() => {
    map.whenReady(report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/* ---------- Ausschnitt an PLZ-Auswahl anpassen ---------- */
function FitBounds({ data, selected }) {
  const map = useMap();
  useEffect(() => {
    if (!data?.features?.length) return;
    const feats = selected ? data.features.filter((f) => f.properties.postal_code === selected) : data.features;
    if (!feats.length) return;
    map.fitBounds(L.geoJSON({ type: "FeatureCollection", features: feats }).getBounds(), { padding: [24, 24] });
  }, [data, selected, map]);
  return null;
}

/** Kartenwerkzeuge nach Mockup (Zoom +/−, Gesamtansicht) */
function MapTools({ fitData, selected }) {
  const map = useMap();
  const ref = useRef(null);
  useEffect(() => {
    // Klicks auf die Werkzeuge nicht an die Karte weiterreichen (kein Doppelklick-Zoom/Ziehen)
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  const fit = () => {
    if (!fitData?.features?.length) return map.setView(PFORZHEIM_CENTER, DEFAULT_ZOOM);
    const feats = selected ? fitData.features.filter((f) => f.properties.postal_code === selected) : fitData.features;
    map.fitBounds(L.geoJSON({ type: "FeatureCollection", features: feats }).getBounds(), { padding: [24, 24] });
  };
  return (
    <div ref={ref} className={styles.tools}>
      <div className={styles.toolGroup}>
        <button type="button" onClick={() => map.zoomIn()} aria-label="Vergrößern">
          <img src="/icons/zoom-in.svg" width={36} height={36} alt="" />
        </button>
        <span className={styles.toolDivider} />
        <button type="button" onClick={() => map.zoomOut()} aria-label="Verkleinern">
          <img src="/icons/zoom-out.svg" width={36} height={36} alt="" />
        </button>
      </div>
      <div className={styles.toolGroup}>
        <button type="button" onClick={fit} aria-label="Ansicht einpassen">
          <img src="/icons/fit.svg" width={36} height={36} alt="" />
        </button>
      </div>
    </div>
  );
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function centroid(geom) {
  const ring = geom.type === "Polygon" ? geom.coordinates[0] : geom.coordinates[0][0];
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}
