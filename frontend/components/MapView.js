"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { CircleMarker, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import {
  BASEMAPS,
  DEFAULT_ZOOM,
  INSTALLATION_SIZES,
  INSTALLED_CLASSES,
  PFORZHEIM_CENTER,
  SUITABILITY_COLORS,
  UTILIZATION_CLASSES,
  classFor,
} from "@/lib/mapConfig";
import { fmtFlex, fmtInt } from "@/lib/format";
import styles from "./MapView.module.css";

/**
 * Leaflet-Karte. Wird nur im Browser geladen (dynamic import, ssr: false).
 * props: basemap, view ('postal'|'buildings'), pvView ('potential'|'existing'),
 *        postalAreas, buildings, installations, selectedPostalCode, labels
 * Legende und Hinweise liegen als Overlays in der Seite (siehe app/karte/page.js).
 */
export default function MapView({ basemap, view, pvView, postalAreas, buildings, installations, selectedPostalCode, labels }) {
  const tiles = BASEMAPS[basemap] ?? BASEMAPS.standard;

  return (
    <MapContainer center={PFORZHEIM_CENTER} zoom={DEFAULT_ZOOM} zoomControl={false} className={styles.map} scrollWheelZoom preferCanvas>
      <TileLayer key={basemap} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />

      {view === "postal" && postalAreas && (
        <PostalLayer data={postalAreas} pvView={pvView} selected={selectedPostalCode} aerial={basemap === "aerial"} />
      )}

      {view === "buildings" && pvView === "potential" && buildings && <BuildingLayer data={buildings} labels={labels} />}

      {view === "buildings" && pvView === "existing" && installations && (
        <InstallationLayer data={installations} labels={labels} />
      )}

      <FitBounds data={postalAreas} selected={selectedPostalCode} />
      <MapTools fitData={postalAreas} selected={selectedPostalCode} />
    </MapContainer>
  );
}

/* ---------- PLZ-Gebiete ---------- */
function PostalLayer({ data, pvView, selected, aerial }) {
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
            color: "#ffffff",
            weight: 2,
            fillColor: cls(f.properties).hex,
            fillOpacity: dim ? 0.25 : aerial ? 0.72 : 0.88,
          };
        }}
      />
      {data.features.map((f) => {
        const p = f.properties;
        const c = cls(p);
        const [lon, lat] = p.label_point ?? centroid(f.geometry);
        const value = pvView === "existing" ? `${fmtFlex(p.installed_power_mwp, 1)} MWp installiert` : `${fmtFlex(p.utilization_pct, 0)} % genutzt`;
        const icon = L.divIcon({
          className: styles.areaLabel,
          html: `<span style="color:${c.text}">${escapeHtml(p.postal_code)}<br/>${escapeHtml(value)}</span>`,
          iconSize: [150, 46],
          iconAnchor: [75, 23],
        });
        return <Marker key={`${f.id}-${pvView}`} position={[lat, lon]} icon={icon} interactive={false} keyboard={false} />;
      })}
    </>
  );
}

/* ---------- Gebäude (freies Potenzial) ---------- */
const FOOTPRINT_MIN_ZOOM = 16; // darunter wären Grundrisse kleiner als ein Pixel → Punkte

function BuildingLayer({ data, labels }) {
  const [zoom, setZoom] = useState(() => null);
  const map = useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  const z = zoom ?? map.getZoom();
  const key = useMemo(() => data.features.map((f) => f.id).join(), [data]);
  const color = (p) => SUITABILITY_COLORS[p.suitability] ?? "#94a3b8";
  const lines = (p) => [
    labels.categories[p.category] ?? String(p.category),
    `Eignungsklasse ${p.suitability} · ${labels.roofTypes[p.roof_type] ?? p.roof_type}`,
    `Potenzial ${fmtFlex(p.potential_kwp, 1)} kWp · ${fmtInt(p.potential_yield_kwh_per_year ?? 0)} kWh/Jahr`,
  ];
  // Leaflet-Tooltips erwarten HTML → Texte escapen
  const tooltip = (p) => {
    const [title, ...rest] = lines(p).map(escapeHtml);
    return `<strong>${title}</strong><br/>${rest.join("<br/>")}`;
  };

  if (z < FOOTPRINT_MIN_ZOOM) {
    return data.features.map((f) => {
      const [lon, lat] = centroid(f.geometry);
      return (
        <CircleMarker
          key={f.id}
          center={[lat, lon]}
          radius={z >= 14 ? 5 : 4}
          pathOptions={{ color: "#ffffff", weight: 1, fillColor: color(f.properties), fillOpacity: 0.95 }}
        >
          <Tooltip>
            {lines(f.properties).map((t, i) => (i === 0 ? <strong key={i}>{t}</strong> : <div key={i}>{t}</div>))}
          </Tooltip>
        </CircleMarker>
      );
    });
  }

  return (
    <GeoJSON
      key={key}
      data={data}
      style={(f) => ({ color: "#ffffff", weight: 0.8, fillColor: color(f.properties), fillOpacity: 0.9 })}
      onEachFeature={(f, layer) => layer.bindTooltip(tooltip(f.properties), { sticky: true })}
    />
  );
}

/* ---------- Bestehende Anlagen ---------- */
function InstallationLayer({ data, labels }) {
  return data.features.map((f) => {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const size = classFor(INSTALLATION_SIZES, p.power_kwp);
    return (
      <CircleMarker
        key={f.id}
        center={[lat, lon]}
        radius={size.radius}
        pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: "#1e5078", fillOpacity: 0.9 }}
      >
        <Tooltip>
          <strong>{fmtFlex(p.power_kwp, 1)} kWp</strong>
          <br />
          {labels.categories[p.category] ?? ""}
          {p.commissioned_on ? ` · in Betrieb seit ${p.commissioned_on.slice(0, 4)}` : ""}
        </Tooltip>
      </CircleMarker>
    );
  });
}

/* ---------- Ausschnitt anpassen ---------- */
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
