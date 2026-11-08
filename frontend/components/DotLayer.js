"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

/**
 * Schnelle Punktebene für zehntausende Gebäude (ein Canvas, kein Leaflet-Layer je Punkt).
 * groups: [{ color: "#hex", scale: 1, points: [[lon, lat], …] }, …] – in dieser Reihenfolge
 * gezeichnet, spätere Gruppen liegen oben. `scale` vergrößert den Punktradius der Gruppe.
 */
const CanvasDots = L.Layer.extend({
  initialize(groups, pane) {
    this._groups = groups;
    this.options.pane = pane;
  },

  onAdd(map) {
    this._map = map;
    this._canvas = L.DomUtil.create("canvas");
    this._canvas.style.pointerEvents = "none";
    (map.getPane(this.options.pane) ?? map.getPane("overlayPane")).appendChild(this._canvas);
    map.on("moveend zoomend resize", this._redraw, this);
    map.on("zoomstart", this._hide, this);
    this._redraw();
  },

  onRemove(map) {
    map.off("moveend zoomend resize", this._redraw, this);
    map.off("zoomstart", this._hide, this);
    L.DomUtil.remove(this._canvas);
  },

  // Während der Zoom-Animation ausblenden, danach neu zeichnen
  _hide() {
    this._canvas.style.visibility = "hidden";
  },

  _redraw() {
    const map = this._map;
    if (!map) return;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x * dpr;
    this._canvas.height = size.y * dpr;
    this._canvas.style.width = `${size.x}px`;
    this._canvas.style.height = `${size.y}px`;

    this._canvas.style.visibility = "visible";
    const ctx = this._canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.x, size.y);

    const z = map.getZoom();
    const r = z >= 14 ? 3 : z >= 13 ? 2.4 : z >= 12 ? 1.8 : 1.3;
    const bounds = map.getBounds().pad(0.05);

    for (const g of this._groups) {
      ctx.fillStyle = g.color;
      const rr = r * (g.scale ?? 1);
      ctx.beginPath();
      for (const [lon, lat] of g.points) {
        if (!bounds.contains([lat, lon])) continue;
        const p = map.latLngToContainerPoint([lat, lon]);
        ctx.moveTo(p.x + rr, p.y);
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  },
});

export default function DotLayer({ groups, pane = "overlayPane" }) {
  const map = useMap();
  useEffect(() => {
    if (!groups?.some((g) => g.points.length)) return;
    const layer = new CanvasDots(groups, pane);
    layer.addTo(map);
    return () => layer.remove();
  }, [map, groups, pane]);
  return null;
}
