"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import DotLayer from "./DotLayer";
import {
  BASEMAPS,
  DEFAULT_ZOOM,
  INSTALLED_CLASSES,
  PFORZHEIM_CENTER,
  SOLAR_STATUS,
  UTILIZATION_CLASSES,
  classFor,
} from "@/lib/mapConfig";
import { fmtFlex, fmtInt } from "@/lib/format";
import styles from "./MapView.module.css";

// Punktübersicht: 1 = Anlage vorhanden, 2 = ungenutztes Potenzial; Bestand wird zuletzt (oben) gezeichnet
const DOT_COLORS = { 1: SOLAR_STATUS.existing.hex, 2: SOLAR_STATUS.potential.hex };
const DOT_ORDER = [2, 1];

// Zusätzliche Kartenebenen (z-Index): overlayPane = 400, Marker = 600, Tooltips = 650
const PANES = { buildingDots: 420, plants: 640 };

/** Legt Leaflet-Panes einmalig an – schon beim Rendern, damit Layer sie beim Hinzufügen vorfinden. */
function EnsurePanes({ panes }) {
  const map = useMap();
  useState(() => {
    for (const [name, z] of Object.entries(panes)) {
      const pane = map.getPane(name) ?? map.createPane(name);
      pane.style.zIndex = String(z);
    }
  });
  return null;
}

/**
 * Leaflet-Karte. Wird nur im Browser geladen (dynamic import, ssr: false).
 * props: basemap, view ('postal'|'buildings'), pvView ('potential'|'existing'),
 *        postalAreas, buildings (Grundrisse, ab Zoom 15), buildingPoints (Punkte, darunter),
 *        installations, selectedPostalCode, labels,
 *        onViewChange({ bbox, zoom }) – meldet den sichtbaren Ausschnitt (für das Nachladen von Gebäuden)
 * Ebenen (unten → oben): Karte, PLZ, Gebäude, Großanlagen (eigene Pane, immer im Vordergrund)
 * Legende und Hinweise liegen als Overlays in der Seite (siehe app/karte/page.js).
 */
export default function MapView({
  basemap, view, pvView, postalAreas, buildings, buildingPoints, installations, selectedPostalCode, labels, onViewChange,
}) {
  const tiles = BASEMAPS[basemap] ?? BASEMAPS.standard;

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
      <TileLayer key={basemap} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />

      {view === "postal" && postalAreas && (
        <PostalLayer data={postalAreas} pvView={pvView} selected={selectedPostalCode} aerial={basemap === "aerial"} />
      )}

      {/* Eigene Ebenen: Großanlagen liegen immer über Gebäuden und PLZ-Flächen */}
      <EnsurePanes panes={PANES} />

      {view === "buildings" && postalAreas && <PostalOutline data={postalAreas} selected={selectedPostalCode} />}
      {view === "buildings" && buildings && <BuildingLayer data={buildings} labels={labels} />}
      {view === "buildings" && !buildings && buildingPoints && (
        <DotLayer points={buildingPoints} colors={DOT_COLORS} order={DOT_ORDER} pane="buildingDots" />
      )}
      {view === "buildings" && installations && <InstallationLayer data={installations} />}

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
  const key = useMemo(() => data.features.map((f) => f.id).join(), [data]);
  return (
    <GeoJSON
      key={key}
      data={data}
      style={(f) => {
        const st = SOLAR_STATUS[f.properties.solar_status] ?? SOLAR_STATUS.none;
        return {
          color: f.properties.solar_status === "existing" ? "#0f2c44" : "#ffffff",
          weight: f.properties.solar_status === "existing" ? 1.2 : 0.6,
          fillColor: st.hex,
          fillOpacity: f.properties.solar_status === "none" ? 0.55 : 0.9,
        };
      }}
      onEachFeature={(f, layer) => {
        const p = f.properties;
        const lines = [
          SOLAR_STATUS[p.solar_status]?.label ?? "",
          [p.name, labels.categories[p.category] ?? p.category].filter(Boolean).join(" · "),
          p.solar_status === "existing"
            ? p.installed_kwp > 0
              ? `${fmtFlex(p.installed_kwp, 1)} kWp laut Marktstammdatenregister`
              : "Anlage in OpenStreetMap erfasst"
            : null,
          p.potential_kwp > 0
            ? `Dachpotenzial ca. ${fmtFlex(p.potential_kwp, 0)} kWp${p.potential_status === "estimated" ? " (geschätzt)" : ""}`
            : null,
          `Grundfläche ${fmtInt(p.footprint_m2)} m² · PLZ ${p.postal_code ?? "–"}`,
        ].filter(Boolean).map(escapeHtml);
        layer.bindTooltip(`<strong>${lines[0]}</strong><br/>${lines.slice(1).join("<br/>")}`, { sticky: true });
      }}
    />
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

  return groups.map((g) => {
    const radius = (g.kwp > 500 ? 9 : g.kwp > 100 ? 7 : 5.5) * scale;
    const first = g.units[0];
    return (
      <CircleMarker
        key={g.key}
        pane="plants"
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
