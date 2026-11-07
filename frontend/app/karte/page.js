"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Donut from "@/components/Donut";
import { getBuildings, getInstallations, getMeta, getPostalAreas, getStats, getStatus } from "@/lib/api/client";
import { INSTALLATION_SIZES, INSTALLED_CLASSES, SUITABILITY_COLORS, UTILIZATION_CLASSES } from "@/lib/mapConfig";
import { fmtFlex, fmtMwp, fmtPct } from "@/lib/format";
import s from "./karte.module.css";

// Leaflet braucht das DOM → nur im Browser laden
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <div className={s.mapLoading}>Karte wird geladen …</div>,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

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
  const [postalAreas, setPostalAreas] = useState(null);
  const [buildings, setBuildings] = useState(null);
  const [installations, setInstallations] = useState(null);
  const [status, setStatus] = useState(null);
  const [stats, setStats] = useState({});
  const [error, setError] = useState(null);

  const fail = () => setError("Die Kartendaten konnten nicht geladen werden. Läuft das Backend auf Port 8000?");

  useEffect(() => {
    Promise.all([getMeta(), getPostalAreas()])
      .then(([m, areas]) => {
        setMeta(m);
        setFilters(initialFilters(m));
        setPostalAreas(areas);
      })
      .catch(fail);
  }, []);

  // Filter, die an das Backend gehen
  const apiFilters = useMemo(
    () => ({
      postal_code: filters.postal_code || undefined,
      category: filters.category ? [filters.category] : undefined,
      suitability: filters.suitability,
    }),
    [filters.postal_code, filters.category, filters.suitability]
  );

  // Gebäude bzw. Anlagen nur laden, wenn die Ansicht sie braucht
  useEffect(() => {
    if (filters.view !== "buildings") return;
    const ctrl = new AbortController();
    const req =
      filters.pv_view === "existing"
        ? getInstallations({ postal_code: apiFilters.postal_code, category: apiFilters.category }, { signal: ctrl.signal }).then(setInstallations)
        : getBuildings({ ...apiFilters, only_free_potential: true }, { signal: ctrl.signal }).then(setBuildings);
    req.catch((e) => e.name !== "AbortError" && fail());
    return () => ctrl.abort();
  }, [filters.view, filters.pv_view, apiFilters]);

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

  const isExample = meta?.data_status === "example";
  const labels = useMemo(
    () => ({
      categories: Object.fromEntries((meta?.categories ?? []).map((o) => [o.value, o.label])),
      roofTypes: Object.fromEntries((meta?.roof_types ?? []).map((o) => [o.value, o.label])),
    }),
    [meta]
  );
  const postalLabel = meta?.postal_codes.find((o) => o.value === filters.postal_code)?.label;

  return (
    <div className="page">
      <div className={s.titleRow}>
        <div className={s.intro}>
          <h1 className={s.title}>Solarkarte Pforzheim</h1>
          <p className={s.subtitle}>Wechsel zwischen bestehenden PV-Anlagen und Potenzial.</p>
        </div>
        {isExample && <span className="chip">Beispieldaten · nicht amtlich</span>}
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <div className={s.filterAndMap}>
        <FilterPanel
          meta={meta}
          filters={filters}
          set={set}
          toggleSuitability={toggleSuitability}
          onReset={() => setFilters(initialFilters(meta))}
        />

        <div className={s.mapFrame}>
          <MapView
            basemap={filters.basemap}
            view={filters.view}
            pvView={filters.pv_view}
            postalAreas={postalAreas}
            buildings={buildings}
            installations={installations}
            selectedPostalCode={filters.postal_code}
            labels={labels}
          />

          <div className={s.mapBadge}>
            <span className={s.mapBadgeCity}>Pforzheim</span>
            <span className={s.mapBadgeDivider} />
            <span className={s.mapBadgeView}>
              {postalLabel ?? (filters.view === "postal" ? "Postleitzahlgebiete" : "Gebäude & Dächer")}
            </span>
          </div>

          <Legend filters={filters} isExample={isExample} />
        </div>
      </div>

      <div className={s.bottomRow}>
        <section className={`card ${s.overviewCard}`} aria-labelledby="pv-uebersicht">
          <h2 id="pv-uebersicht" className={s.cardTitle}>PV Übersicht</h2>
          <p className={s.cardSub}>
            {isExample ? "Beispielwerte · " : ""}
            {postalLabel ?? "Stadtmodell"}
          </p>
          <div className={s.modelValues}>
            <div className={s.modelValue}>
              <span>Bestand</span>
              <strong>{status ? fmtMwp(status.installed_power_mwp) : "–"}</strong>
            </div>
            <div className={s.modelValue}>
              <span>Gesamtpotenzial</span>
              <strong>{status ? fmtMwp(status.potential_power_mwp) : "–"}</strong>
            </div>
            <div className={s.coverage}>
              <div className={s.modelValue}>
                <span>Bereits gedeckt</span>
                <strong className={s.coverageValue}>{status ? fmtPct(status.utilization_pct) : "–"}</strong>
              </div>
              <div className={s.coverageBar} role="presentation">
                <i style={{ width: `${Math.min(status?.utilization_pct ?? 0, 100)}%` }} />
              </div>
            </div>
          </div>
        </section>

        <BreakdownCard title="Dachformen" data={stats.roof} isExample={isExample} />
        <BreakdownCard title="Gebäudekategorien" data={stats.cat} isExample={isExample} />
        <BreakdownCard
          title="Eignungsklassen"
          data={stats.suit}
          isExample={isExample}
          colorFor={(item) => SUITABILITY_COLORS[item.key]}
        />
      </div>

      <p className="footnote">
        {isExample
          ? "PLZ-Grenzen, Gebäude und Nutzungswerte sind Beispieldaten, keine amtlichen Geodaten. "
          : ""}
        Diagramme und PV-Übersicht berücksichtigen die gewählten Filter (PLZ-Gebiet, Gebäudekategorie, Eignungsklassen).
      </p>
    </div>
  );
}

/* ---------------- Filter ---------------- */
function FilterPanel({ meta, filters, set, toggleSuitability, onReset }) {
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

      <fieldset className={s.group}>
        <legend className={s.groupLabel}>Eignungsklassen</legend>
        <div className={s.chips}>
          {(meta?.suitability_classes ?? []).map((o) => {
            const on = filters.suitability.includes(o.value);
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
function Legend({ filters, isExample }) {
  let title, items, note;
  if (filters.view === "postal") {
    const classes = filters.pv_view === "existing" ? INSTALLED_CLASSES : UTILIZATION_CLASSES;
    title = filters.pv_view === "existing" ? "Installierte PV-Leistung je Gebiet" : "Genutztes PV-Potenzial je Gebiet";
    items = classes.map((c) => ({ label: c.label, swatch: <i className={s.swatch} style={{ background: c.hex }} /> }));
    note =
      filters.pv_view === "existing"
        ? "Summe der installierten Leistung aller bekannten Anlagen im Gebiet"
        : "Installierte PV-Leistung ÷ gesamtes PV-Leistungspotenzial im Gebiet × 100";
  } else if (filters.pv_view === "existing") {
    title = "Bestehende PV-Anlagen";
    items = INSTALLATION_SIZES.map((c) => ({
      label: c.label,
      swatch: <i className={s.dot} style={{ width: c.radius * 2, height: c.radius * 2 }} />,
    }));
    note = "Anlagen bis 30 kWp aus dem Marktstammdatenregister";
  } else {
    title = "Eignungsklasse (freies Potenzial)";
    items = Object.entries(SUITABILITY_COLORS).map(([k, color]) => ({
      label: `Klasse ${k}`,
      swatch: <i className={s.swatch} style={{ background: color }} />,
    }));
    note = "Gebäude ohne bestehende Anlage, Einstufung laut LUBW-Dachflächenpotenzial";
  }

  return (
    <div className={s.legend}>
      <div className={s.legendHead}>
        <strong>Legende</strong>
        {isExample && <span>Beispieldaten</span>}
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
function BreakdownCard({ title, data, isExample, colorFor }) {
  const items = data?.items ?? [];
  const color = (it, i) => colorFor?.(it) ?? CHART_COLORS[i % CHART_COLORS.length];
  const total = items.reduce((sum, it) => sum + it.building_count, 0);

  return (
    <section className={`card ${s.breakdown}`}>
      <h2 className={s.cardTitle}>{title}</h2>
      <p className={s.cardSub}>{isExample ? "Beispielverteilung" : "Verteilung"} · nach Anzahl</p>
      <div className={s.breakdownBody}>
        <Donut
          size={88}
          thickness={16}
          label={`${title}: ${items.map((it) => `${it.label} ${fmtFlex(it.share_pct, 0)} %`).join(", ")}`}
          segments={items.map((it, i) => ({ key: it.key, value: it.building_count, color: color(it, i) }))}
        >
          <span className={s.donutValue}>{total ? "100%" : "–"}</span>
          <span className={s.donutSub}>{total ? "Anteile" : "keine Daten"}</span>
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
    </section>
  );
}
