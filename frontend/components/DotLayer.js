"use client";

import { useEffect } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

/**
 * Schnelle Punktebene für zehntausende Gebäude (ein Canvas, kein Leaflet-Layer je Punkt).
 * points: [[lon, lat, statusCode], …]; colors: { [statusCode]: "#hex" }
 * Punkte mit höherem `order` werden zuletzt (oben) gezeichnet.
 */
const CanvasDots = L.Layer.extend({
  initialize(points, colors, order, pane) {
    this._points = points;
    this._colors = colors;
    this._order = order;
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

    for (const code of this._order) {
      ctx.fillStyle = this._colors[code];
      // Bestand größer, damit er zwischen den Potenzial-Punkten auffällt
      const rr = code === this._order[this._order.length - 1] ? r * 1.35 : r;
      ctx.beginPath();
      for (const [lon, lat, c] of this._points) {
        if (c !== code || !bounds.contains([lat, lon])) continue;
        const p = map.latLngToContainerPoint([lat, lon]);
        ctx.moveTo(p.x + rr, p.y);
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  },
});

export default function DotLayer({ points, colors, order, pane = "overlayPane" }) {
  const map = useMap();
  useEffect(() => {
    if (!points?.length) return;
    const layer = new CanvasDots(points, colors, order, pane);
    layer.addTo(map);
    return () => layer.remove();
  }, [map, points, colors, order, pane]);
  return null;
}
