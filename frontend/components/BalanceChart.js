"use client";

import { useEffect, useRef, useState } from "react";
import { fmtFlex, fmtMio } from "@/lib/format";

const H = 170;
const PAD_L = 48; // Platz für Achsenwerte
const PAD_R = 40; // Platz für "Jahre"
const TOP = 22;
const BOTTOM = 137; // Grundlinie der Zeichenfläche

/** Schöne Rasterwerte (in Mio. €): kleinster „runder“ Schritt mit höchstens `maxCount` Linien */
function niceTicks(min, max, maxCount = 5) {
  const span = Math.max(max - min, 1);
  const mag = 10 ** Math.floor(Math.log10(span / (maxCount - 1)));
  for (const m of [1, 2, 2.5, 3, 5, 10, 20]) {
    const step = m * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    if ((hi - lo) / step + 1 <= maxCount) {
      const ticks = [];
      for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
      return ticks;
    }
  }
  return [min, max];
}

/** Erster Nulldurchgang des Saldos (Jahre, linear zwischen den Jahreswerten); null, wenn nicht erreicht */
function breakEven(timeline) {
  for (let i = 1; i < timeline.length; i++) {
    const a = timeline[i - 1].cumulative_balance_eur;
    const b = timeline[i].cumulative_balance_eur;
    if (a < 0 && b >= 0) {
      const t0 = timeline[i - 1].year_index;
      return t0 + (-a / (b - a)) * (timeline[i].year_index - t0);
    }
  }
  return null;
}

/** Saldo (Mio. €) zum Zeitpunkt t (Jahre), linear zwischen den Jahreswerten */
function valueAt(timeline, values, t) {
  for (let i = 1; i < timeline.length; i++) {
    const t0 = timeline[i - 1].year_index;
    const t1 = timeline[i].year_index;
    if (t <= t1) return values[i - 1] + ((t - t0) / (t1 - t0 || 1)) * (values[i] - values[i - 1]);
  }
  return values[values.length - 1];
}

/**
 * Kumulierter Saldo (Anschaffung + Instandhaltung gegen Stromwert) mit Amortisationspunkt
 * (Mockup „Finanzielle Entwicklung“). Der Endwert entspricht dem Gewinn der Überschlagsrechnung; der
 * Amortisationspunkt ist derselbe Wert wie in der Überschlagsrechnung (nur Anschaffung, ohne Instandhaltung)
 * und liegt daher etwas vor dem Nulldurchgang der Linie.
 */
export default function BalanceChart({ timeline, amortizationYears, investmentEur }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(744);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!timeline?.length) return <div ref={wrapRef} style={{ height: H }} />;

  const years = timeline[timeline.length - 1].year_index;
  const values = timeline.map((p) => p.cumulative_balance_eur / 1e6);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];

  const plotW = width - PAD_L - PAD_R;
  const x = (t) => PAD_L + 4 + (t / Math.max(years, 1)) * (plotW - 8);
  const y = (v) => BOTTOM - ((v - yMin) / (yMax - yMin || 1)) * (BOTTOM - TOP);

  const pts = timeline.map((p, i) => [x(p.year_index), y(values[i])]);
  const line = pts.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");

  // Amortisation wie in der Überschlagsrechnung (nur Anschaffung); Punkt sitzt auf der Linie
  const amort = amortizationYears != null && amortizationYears > 0 && amortizationYears <= years ? amortizationYears : null;
  const breakEvenT = breakEven(timeline); // Nulldurchgang der Linie (inkl. Instandhaltung)
  const end = pts[pts.length - 1];
  const endValue = values[values.length - 1];

  // Fläche des positiven Saldos (ab Nulldurchgang der Linie bis Ende)
  let area = null;
  if (breakEvenT != null) {
    const ax = x(breakEvenT);
    const after = pts.filter(([px]) => px > ax);
    area = `M${ax},${y(0)} ` + after.map(([px, py]) => `L${px},${py}`).join(" ") + ` L${end[0]},${y(0)} Z`;
  }

  const xTicks = [];
  const xStep = years <= 10 ? 1 : years <= 20 ? 5 : 5;
  for (let t = 0; t <= years; t += xStep) xTicks.push(t);
  if (xTicks[xTicks.length - 1] !== years) xTicks.push(years);

  const calloutW = 101;
  const calloutX = amort != null ? Math.min(Math.max(x(amort) - calloutW / 2, PAD_L), width - PAD_R - calloutW) : 0;

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img"
        aria-label={`Kumulierter Saldo über ${years} Jahre, Endsaldo ${fmtMio(endValue * 1e6)}`}
        style={{ display: "block", overflow: "visible", fontFamily: "inherit" }}>
        {/* Gitternetz */}
        {ticks.map((v) => (
          <g key={v}>
            <text x={36} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-subtle)">
              {fmtFlex(v, 1).replace("-", "−")}
            </text>
            <line x1={PAD_L} x2={width - 14} y1={y(v)} y2={y(v)} stroke={v === 0 ? "var(--border-strong)" : "var(--border)"} />
          </g>
        ))}

        {/* X-Achse */}
        {xTicks.map((t) => (
          <text key={t} x={x(t)} y={158} textAnchor="middle" fontSize="10" fill="var(--text-subtle)">
            {t}
          </text>
        ))}
        <text x={width - 36} y={158} fontSize="10" fill="var(--text-subtle)">
          Jahre
        </text>

        {area && <path d={area} fill="var(--pf-blue)" opacity="0.12" />}
        <path d={line} fill="none" stroke="var(--pf-blue)" strokeWidth="1.5" />

        {/* Startinvestition */}
        {/* weißer Halo hält die Beschriftung über der Linie lesbar */}
        <text x={x(0) + 10} y={y(values[0]) - 8} fontSize="10" fill="var(--text-muted)"
          stroke="#fff" strokeWidth="3" paintOrder="stroke" strokeLinejoin="round">
          {fmtMio(-investmentEur)} · zusätzlicher Ausbau
        </text>

        {/* Amortisation */}
        {amort != null && (
          <g>
            <line x1={x(amort)} x2={x(amort)} y1={71} y2={137} stroke="var(--border-strong)" />
            <circle cx={x(amort)} cy={y(valueAt(timeline, values, amort))} r="4" fill="var(--pf-blue)" stroke="#fff" strokeWidth="1.5" />
            <foreignObject x={calloutX} y={41} width={calloutW} height={62}>
              <div
                style={{
                  background: "var(--pf-blue-50)",
                  borderRadius: 6,
                  padding: "6px 8px",
                  color: "var(--pf-blue)",
                  textAlign: "center",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span style={{ fontSize: 12 }}>{fmtFlex(amort, 1)} Jahre</span>
                <span style={{ fontSize: 10 }}>Amortisation zusätzlicher Ausbau</span>
              </div>
            </foreignObject>
          </g>
        )}

        {/* Endsaldo */}
        <circle cx={end[0]} cy={end[1]} r="4" fill="var(--pf-blue)" stroke="#fff" strokeWidth="1.5" />
        <text x={end[0] - 8} y={Math.max(end[1] - 10, 10)} textAnchor="end" fontSize="12" fill="var(--pf-blue)">
          {fmtMio(endValue * 1e6, { sign: true })}
        </text>
      </svg>
    </div>
  );
}
