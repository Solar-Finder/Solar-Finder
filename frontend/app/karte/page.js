"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Donut from "@/components/Donut";
import { getBuildingPoints, getBuildings, getInstallations, getMeta, getPostalAreas, getStats, getStatus } from "@/lib/api/client";
import {
  BUILDINGS_MIN_ZOOM,
  INSTALLED_CLASSES,
  SOLAR_STATUS,
  SUITABILITY_COLORS,
  UTILIZATION_CLASSES,
} from "@/lib/mapConfig";
import { fmtFlex, fmtInt, fmtMwp, fmtPct } from "@/lib/format";
import s from "./karte.module.css";

// Leaflet braucht das DOM → nur im Browser laden
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Karte wird geladen …</div>,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const VIEWPORT_DEBOUNCE_MS = 250;

const initialFilters = (meta) => ({
  view: "postal", // 'postal' | 'buildings'
  postal_code: "",
  pv_view: "potential", // 'potential' | 'existing'
  basemap: "standard", // 'standard' | 'aerial'
  category: "",
  suitability: meta ? meta.suitability_classes.map((o) => o.value) : [1, 2, 3, 6],
});

export default function KartePage() {
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState(initialFilters(null));
  const [viewport, setViewport] = useState(null); // { bbox, zoom }
  const [postalAreas, setPostalAreas] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [buildingPoints, setBuildingPoints] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [installations, setInstallations] = useState(null);
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState({});
  const [error, setError] = useState(null);

  const fail = () => setError("Die Kartendaten konnten nicht geladen werden. Läuft das Backend auf Port 8000?");
  // Nach erfolgreichem Nachladen die Meldung wieder ausblenden (sonst bleibt ein einzelner Aussetzer stehen)
  const ok = () => setError(null);

  useEffect(() => {
    Promise.all([getMeta(), getPostalAreas()])
      .then(([m, areas]) => {
        setMeta(m);
        setFilters(initialFilters(m));
        setPostalAreas(areas);
        ok();
      })
      .catch(fail);
  }, []);

  const suitabilityReady = meta && meta.suitability_status !== "pending";
  const apiFilters = useMemo(
    () => ({
      postal_code: filters.postal_code || undefined,
      category: filters.category ? [filters.category] : undefined,
      // Eignungsklassen wirken erst, wenn die LUBW-Daten angebunden sind
      suitability: suitabilityReady ? filters.suitability : undefined,
    }),
    [filters.postal_code, filters.category, filters.suitability, suitabilityReady]
  );

  const zoomedIn = (viewport?.zoom ?? 0) >= BUILDINGS_MIN_ZOOM;

  // Gebäude: nur in der Gebäudeansicht und ab Zoomstufe 15, nach sichtbarem Ausschnitt
  useEffect(() => {
    if (filters.view !== "buildings" || !zoomedIn || !viewport) {
      setBuildings(null);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      getBuildings(
        {
          bbox: viewport.bbox,
          postal_code: apiFilters.postal_code,
          category: apiFilters.category,
          solar_status: filters.pv_view === "existing" ? ["existing"] : undefined,
        },
        { signal: ctrl.signal }
      )
        .then((fc) => {
          setBuildings(fc);
          setTruncated(fc.truncated);
          ok();
        })
        .catch((e) => e.name !== "AbortError" && fail());
    }, VIEWPORT_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [filters.view, filters.pv_view, zoomedIn, viewport, apiFilters]);

  // Übersicht aller Gebäude als Punkte (sichtbar unterhalb von Zoom 15, ohne Nachladen beim Verschieben)
  useEffect(() => {
    if (filters.view !== "buildings") return;
    const ctrl = new AbortController();
    getBuildingPoints(
      {
        postal_code: apiFilters.postal_code,
        category: apiFilters.category,
        solar_status: filters.pv_view === "existing" ? ["existing"] : undefined,
      },
      { signal: ctrl.signal }
    )
      .then((r) => {
        setBuildingPoints(r.points);
        ok();
      })
      .catch((e) => e.name !== "AbortError" && fail());
    return () => ctrl.abort();
  }, [filters.view, filters.pv_view, apiFilters.postal_code, apiFilters.category]);

  // Verortete Großanlagen (MaStR, > 30 kW)
  useEffect(() => {
    if (filters.view !== "buildings") return;
    const ctrl = new AbortController();
    getInstallations({ postal_code: apiFilters.postal_code }, { signal: ctrl.signal })
      .then((fc) => {
        setInstallations(fc);
        ok();
      })
      .catch((e) => e.name !== "AbortError" && fail());
    return () => ctrl.abort();
  }, [filters.view, apiFilters.postal_code]);

  // PV-Übersicht und Diagramme
  useEffect(() => {
    const ctrl = new AbortController();
    const o = { signal: ctrl.signal };
    Promise.all([
      getStatus(apiFilters.postal_code, o),
      getStats("roof-types", apiFilters, o),
      getStats("building-categories", apiFilters, o),
      getStats("suitability-classes", apiFilters, o),
    ])
      .then(([st, roof, cat, suit]) => {
        setStatus(st);
        setStats({ roof, cat, suit });
        ok();
      })
      .catch((e) => e.name !== "AbortError" && fail());
    return () => ctrl.abort();
  }, [apiFilters]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const toggleSuitability = (v) =>
    setFilters((f) => {
      const has = f.suitability.includes(v);
      if (has && f.suitability.length === 1) return f; // mindestens eine Klasse aktiv
      return { ...f, suitability: has ? f.suitability.filter((x) => x !== v) : [...f.suitability, v].sort((a, b) => a - b) };
    });

  const potentialEstimated = meta?.potential_status === "estimated";
  const labels = useMemo(
    () => ({
      categories: Object.fromEntries((meta?.categories ?? []).map((o) => [o.value, o.label])),
      roofTypes: Object.fromEntries((meta?.roof_types ?? []).map((o) => [o.value, o.label])),
    }),
    [meta]
  );
  const postalLabel = meta?.postal_codes.find((o) => o.value === filters.postal_code)?.label;
  const unlocated = status ? status.installation_count - status.located_installation_count : null;

  return (
    <div className="page">
      <div className={s.titleRow}>
        <div className={s.intro}>
          <h1 className={s.title}>Solarkarte Pforzheim</h1>
          <p className={s.subtitle}>Wechsel zwischen bestehenden PV-Anlagen und Potenzial.</p>
        </div>
        {meta && (
          <span className="chip">
            Anlagen: Marktstammdatenregister · Potenzial {potentialEstimated ? "geschätzt" : "LUBW"}
          </span>
        )}
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className={s.filterAndMap}>
        <FilterPanel
          meta={meta}
          filters={filters}
          set={set}
          toggleSuitability={toggleSuitability}
          suitabilityReady={suitabilityReady}
          onReset={() => setFilters(initialFilters(meta))}
        />

        <div className={s.mapFrame}>
          <MapView
            basemap={filters.basemap}
            view={filters.view}
            pvView={filters.pv_view}
            postalAreas={postalAreas}
            buildings={buildings}
            buildingPoints={buildingPoints}
            installations={filters.view === "buildings" ? installations : null}
            selectedPostalCode={filters.postal_code}
            labels={labels}
            onViewChange={setViewport}
          />

          <div className={s.mapBadge}>
            <span className={s.mapBadgeCity}>Pforzheim</span>
            <span className={s.mapBadgeDivider} />
            <span className={s.mapBadgeView}>
              {postalLabel ?? (filters.view === "postal" ? "Postleitzahlgebiete" : "Gebäude & Dächer")}
            </span>
          </div>

          {filters.view === "buildings" && !zoomedIn && (
            <div className={s.mapHint} role="status">
              Jeder Punkt ist ein Gebäude · für Grundrisse und Details heranzoomen
            </div>
          )}
          {filters.view === "buildings" && zoomedIn && truncated && (
            <div className={s.mapHint} role="status">
              Sehr viele Gebäude im Ausschnitt – bitte weiter heranzoomen
            </div>
          )}

          <Legend filters={filters} potentialEstimated={potentialEstimated} unlocated={unlocated} />
        </div>
      </div>

      <div className={s.bottomRow}>
        <section className={`card ${s.overviewCard}`} aria-labelledby="pv-uebersicht">
          <h2 id="pv-uebersicht" className={s.cardTitle}>PV Übersicht</h2>
          <p className={s.cardSub}>{postalLabel ?? "Stadt Pforzheim"}</p>
          <div className={s.modelValues}>
            <div className={s.modelValue}>
              <span>Bestand</span>
              <strong>{status ? fmtMwp(status.installed_power_mwp) : "–"}</strong>
            </div>
            <div className={s.modelValue}>
              <span>Potenzial{potentialEstimated ? " (geschätzt)" : ""}</span>
              <strong>{status ? fmtMwp(status.potential_power_mwp) : "–"}</strong>
            </div>
            <div className={s.coverage}>
              <div className={s.modelValue}>
                <span>Bereits gedeckt</span>
                <strong className={s.coverageValue}>{status ? fmtPct(status.utilization_pct, 1) : "–"}</strong>
              </div>
              <div className={s.coverageBar} role="presentation">
                <i style={{ width: `${Math.min(status?.utilization_pct ?? 0, 100)}%` }} />
              </div>
            </div>
            {status && (
              <p className={s.countNote}>
                {fmtInt(status.installation_count)} Anlagen, davon {fmtInt(status.located_installation_count)} gebäudegenau
                verortet und {fmtInt(status.balcony_count)} Balkonkraftwerke
              </p>
            )}
          </div>
        </section>

        <BreakdownCard title="Dachformen" data={stats.roof} />
        <BreakdownCard title="Gebäudekategorien" data={stats.cat} />
        <BreakdownCard title="Eignungsklassen" data={stats.suit} colorFor={(item) => SUITABILITY_COLORS[item.key]} />
      </div>
    </div>
  );
}

/* ---------------- Filter ---------------- */
function FilterPanel({ meta, filters, set, toggleSuitability, suitabilityReady, onReset }) {
  return (
    <aside className={`card ${s.filters}`} aria-labelledby="kartenansicht">
      <div className="section-head">
        <h2 id="kartenansicht" className={s.filterTitle}>Kartenansicht</h2>
        <button type="button" className="link-button" style={{ fontSize: 11 }} onClick={onReset}>
          Zurücksetzen
        </button>
      </div>

      <fieldset className={s.group}>
        <legend className={s.groupLabel}>Räumliche Darstellung</legend>
        <RadioOption name="view" value="buildings" checked={filters.view === "buildings"} onChange={() => set("view", "buildings")}>
          Gebäude &amp; Dächer
        </RadioOption>
        <RadioOption name="view" value="postal" checked={filters.view === "postal"} onChange={() => set("view", "postal")}>
          Postleitzahlgebiete
        </RadioOption>
      </fieldset>

      <SelectField
        label="Postleitzahlgebiete"
        value={filters.postal_code}
        onChange={(v) => set("postal_code", v)}
        active={filters.view === "postal" || !!filters.postal_code}
        options={[{ value: "", label: "Alle Postleitzahlgebiete" }, ...(meta?.postal_codes ?? [])]}
      />

      <SelectField
        label="PV-Ansicht"
        value={filters.pv_view}
        onChange={(v) => set("pv_view", v)}
        options={meta?.pv_views ?? [{ value: "potential", label: "Potenzial" }]}
      />

      <fieldset className={s.group}>
        <legend className={s.groupLabel}>Basiskarte</legend>
        <RadioOption name="basemap" value="standard" checked={filters.basemap === "standard"} onChange={() => set("basemap", "standard")}>
          Standard-Map
        </RadioOption>
        <RadioOption name="basemap" value="aerial" checked={filters.basemap === "aerial"} onChange={() => set("basemap", "aerial")}>
          Luftbild
        </RadioOption>
      </fieldset>

      <SelectField
        label="Gebäudekategorie"
        value={filters.category}
        onChange={(v) => set("category", v)}
        options={[{ value: "", label: "Alle Gebäude" }, ...(meta?.categories ?? [])]}
      />

      <fieldset className={s.group} disabled={!suitabilityReady}>
        <legend className={s.groupLabel}>
          Eignungsklassen{!suitabilityReady && <span className={s.pendingTag}> · folgt (LUBW)</span>}
        </legend>
        <div className={s.chips}>
          {(meta?.suitability_classes ?? []).map((o) => {
            const on = suitabilityReady && filters.suitability.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={`${s.classChip} ${on ? s.classChipOn : ""}`}
                aria-pressed={on}
                aria-label={o.label}
                onClick={() => toggleSuitability(o.value)}
              >
                {o.value}
              </button>
            );
          })}
        </div>
      </fieldset>
    </aside>
  );
}

function RadioOption({ name, value, checked, onChange, children }) {
  return (
    <label className={`${s.radio} ${checked ? s.radioOn : ""}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="visually-hidden" />
      {checked ? (
        <img src="/icons/radio-checked.svg" width={16} height={16} alt="" />
      ) : (
        <span className={s.radioDot} aria-hidden="true" />
      )}
      <span>{children}</span>
    </label>
  );
}

function SelectField({ label, value, onChange, options, active }) {
  return (
    <label className={s.group}>
      <span className={s.groupLabel}>{label}</span>
      <span className={`${s.select} ${active ? s.selectActive : ""}`}>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <img src={active ? "/icons/chevron-down-active.svg" : "/icons/chevron-down.svg"} width={16} height={16} alt="" />
      </span>
    </label>
  );
}

/* ---------------- Legende ---------------- */
function Legend({ filters, potentialEstimated, unlocated }) {
  let title, items, note;
  if (filters.view === "postal") {
    const existing = filters.pv_view === "existing";
    title = existing ? "Installierte PV-Leistung je Gebiet" : "Genutztes PV-Potenzial je Gebiet";
    items = (existing ? INSTALLED_CLASSES : UTILIZATION_CLASSES).map((c) => ({
      label: c.label,
      swatch: <i className={s.swatch} style={{ background: c.hex }} />,
    }));
    note = existing
      ? "Summe aller Anlagen im Marktstammdatenregister (inkl. Kleinanlagen)"
      : `Installierte Leistung ÷ ${potentialEstimated ? "geschätztes " : ""}Dachpotenzial im Gebiet × 100`;
  } else {
    title = "Gebäude";
    const keys = filters.pv_view === "existing" ? ["existing"] : ["existing", "potential", "none"];
    items = [
      ...keys.map((k) => ({ label: SOLAR_STATUS[k].label, swatch: <i className={s.swatch} style={{ background: SOLAR_STATUS[k].hex }} /> })),
      { label: "Großanlage > 30 kW (MaStR-Standort)", swatch: <i className={s.dot} /> },
    ];
    note =
      `Kleinanlagen bis 30 kW sind im Marktstammdatenregister nur der PLZ zugeordnet` +
      (unlocated != null ? ` (${fmtInt(unlocated)} Anlagen)` : "") +
      ` und hier nicht gebäudegenau darstellbar. ${potentialEstimated ? "Potenzial geschätzt aus der Grundfläche." : ""}`;
  }

  return (
    <div className={s.legend}>
      <div className={s.legendHead}>
        <strong>Legende</strong>
        {potentialEstimated && <span>Potenzial geschätzt</span>}
      </div>
      <hr />
      <p className={s.legendSection}>{title}</p>
      <ul>
        {items.map((it) => (
          <li key={it.label}>
            {it.swatch}
            {it.label}
          </li>
        ))}
      </ul>
      <hr />
      <p className={s.legendNote}>{note}</p>
    </div>
  );
}

/* ---------------- Auswertungskarten ---------------- */
function BreakdownCard({ title, data, colorFor }) {
  const items = (data?.items ?? []).filter((it) => it.building_count > 0);
  const pending = data?.data_status === "pending";
  const color = (it, i) => colorFor?.(it) ?? CHART_COLORS[i % CHART_COLORS.length];
  const total = items.reduce((sum, it) => sum + it.building_count, 0);

  return (
    <section className={`card ${s.breakdown}`}>
      <h2 className={s.cardTitle}>{title}</h2>
      <p className={s.cardSub}>{pending ? "Datenquelle folgt" : `${data?.note ?? "Verteilung"} · nach Anzahl`}</p>
      {pending ? (
        <div className={s.pendingBody}>
          <Donut size={88} thickness={16} label={`${title}: Daten folgen`} segments={[]}>
            <span className={s.donutSub}>folgt</span>
          </Donut>
          <p className={s.pendingText}>{data?.note ?? "Daten folgen"}</p>
        </div>
      ) : (
        <div className={s.breakdownBody}>
          <Donut
            size={88}
            thickness={16}
            label={`${title}: ${items.map((it) => `${it.label} ${fmtFlex(it.share_pct, 0)} %`).join(", ")}`}
            segments={items.map((it, i) => ({ key: it.key, value: it.building_count, color: color(it, i) }))}
          >
            <span className={s.donutValue}>{total ? fmtInt(total) : "–"}</span>
            <span className={s.donutSub}>{total ? "Gebäude" : "keine Daten"}</span>
          </Donut>
          <ul className={s.breakdownLegend}>
            {items.map((it, i) => (
              <li key={it.key}>
                <i style={{ background: color(it, i) }} />
                {it.label} · {fmtFlex(it.share_pct, 0)}%
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
