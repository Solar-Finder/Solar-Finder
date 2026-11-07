"use client";

import { useEffect, useMemo, useState } from "react";
import RangeSlider from "@/components/RangeSlider";
import BalanceChart from "@/components/BalanceChart";
import Donut from "@/components/Donut";
import { getMeta, getStatus, postForecast } from "@/lib/api/client";
import { fmtFlex, fmtInt, fmtMio, fmtMwp, fmtPct } from "@/lib/format";
import s from "./rechner.module.css";

const FORECAST_DEBOUNCE_MS = 150;

export default function RechnerPage() {
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [error, setError] = useState(null);

  // Startdaten laden
  useEffect(() => {
    Promise.all([getMeta(), getStatus()])
      .then(([m, st]) => {
        setMeta(m);
        setStatus(st);
        setConfig(defaultConfig(m));
      })
      .catch(() => setError("Die Daten konnten nicht geladen werden. Läuft das Backend auf Port 8000?"));
  }, []);

  // Prognose bei jeder Änderung neu berechnen (entprellt)
  useEffect(() => {
    if (!config) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      postForecast(config, { signal: ctrl.signal })
        .then((f) => {
          setForecast(f);
          setError(null);
        })
        .catch((e) => e.name !== "AbortError" && setError("Die Prognose konnte nicht berechnet werden."));
    }, FORECAST_DEBOUNCE_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [config]);

  const set = (key) => (value) => setConfig((c) => ({ ...c, [key]: value }));
  const isExample = meta?.data_status === "example";

  return (
    <div className="page">
      {error && <div className="error-banner" role="alert">{error}</div>}

      <Overview status={status} />

      <div className={s.inputsResults}>
        <Configuration meta={meta} config={config} forecast={forecast} set={set} onReset={() => setConfig(defaultConfig(meta))} />
        <Forecasts forecast={forecast} years={config?.horizon_years} />
      </div>

      <Development forecast={forecast} config={config} isExample={isExample} />

      <Assumptions forecast={forecast} config={config} isExample={isExample} />
    </div>
  );
}

function defaultConfig(meta) {
  return {
    target_utilization_pct: meta.sliders.target_utilization_pct.default,
    horizon_years: meta.sliders.horizon_years.default,
    electricity_price_ct_per_kwh: meta.electricity_price.value_ct_per_kwh,
  };
}

/* ---------------- PV-Übersicht ---------------- */
function Overview({ status }) {
  return (
    <section className={`card ${s.overview}`} aria-labelledby="pv-overview">
      <div className="section-head">
        <h2 id="pv-overview" className={s.overviewTitle}>PV-Übersicht</h2>
        {status && <span className="note">Quelle: {status.source}</span>}
      </div>
      <div className={s.statRow}>
        <Stat label="Aktuell installiert" value={status && fmtMwp(status.installed_power_mwp)} />
        <Stat label="Potenziell" value={status && fmtMwp(status.potential_power_mwp)} />
        <Stat label="Gedeckt" value={status && fmtPct(status.utilization_pct)} highlight />
      </div>
    </section>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div className={`${s.stat} ${highlight ? s.statHighlight : ""}`}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value ?? "–"}</span>
    </div>
  );
}

/* ---------------- Konfiguration ---------------- */
function Configuration({ meta, config, forecast, set, onReset }) {
  if (!meta || !config) return <section className={`card ${s.config}`} aria-busy="true" />;
  const sl = meta.sliders;
  const apiPrice = meta.electricity_price.value_ct_per_kwh;
  const f = forecast;

  return (
    <section className={`card ${s.config}`} aria-labelledby="config-title">
      <div className="section-head">
        <h2 id="config-title" className="section-title">Konfiguration</h2>
        <button type="button" className="link-button" onClick={onReset}>
          Zurücksetzen
        </button>
      </div>

      <RangeSlider
        label="Zielauslastung des Solarpotenzials"
        value={config.target_utilization_pct}
        {...pick(sl.target_utilization_pct)}
        onChange={set("target_utilization_pct")}
        display={fmtPct(config.target_utilization_pct)}
        rangeLabels={[
          `${fmtPct(sl.target_utilization_pct.min)} · ${f ? fmtMwp(f.existing_power_mwp) : "–"} Bestand`,
          `${fmtPct(config.target_utilization_pct)} Ziel · ${f ? fmtMwp(f.new_power_mwp) : "–"} Zubau`,
          `${fmtPct(sl.target_utilization_pct.max)} · ${f ? fmtMwp(f.potential_power_mwp) : "–"}`,
        ]}
      />

      <RangeSlider
        label="Betrachtungszeitraum"
        value={config.horizon_years}
        {...pick(sl.horizon_years)}
        onChange={set("horizon_years")}
        display={`${config.horizon_years} Jahre`}
        rangeLabels={[`${sl.horizon_years.min} Jahre`, `${sl.horizon_years.max} Jahre`]}
      />

      <RangeSlider
        label="Strompreis · manuell anpassbar"
        value={config.electricity_price_ct_per_kwh}
        {...pick(sl.electricity_price_ct_per_kwh)}
        onChange={set("electricity_price_ct_per_kwh")}
        display={`${fmtFlex(config.electricity_price_ct_per_kwh, 1)} ct/kWh`}
        rangeLabels={[`${sl.electricity_price_ct_per_kwh.min} ct`, `${sl.electricity_price_ct_per_kwh.max} ct`]}
      >
        <div className={s.apiValue}>
          <img src="/icons/database.svg" width={14} height={14} alt="" />
          <span className={s.apiValueText}>
            API-Ausgangswert: {fmtFlex(apiPrice, 1)} ct/kWh
            {meta.electricity_price.is_example ? " (Beispiel)" : ` (${meta.electricity_price.source})`}
          </span>
          <button
            type="button"
            className={s.apiReset}
            onClick={() => set("electricity_price_ct_per_kwh")(apiPrice)}
            disabled={config.electricity_price_ct_per_kwh === apiPrice}
          >
            <img src="/icons/rotate-ccw.svg" width={12} height={12} alt="" />
            Auf API-Wert
          </button>
        </div>
      </RangeSlider>
    </section>
  );
}

const pick = ({ min, max, step }) => ({ min, max, step });

/* ---------------- Prognosen ---------------- */
function Forecasts({ forecast: f, years: horizon }) {
  const years = horizon ?? "–";
  return (
    <section className={`card ${s.forecast}`} aria-labelledby="forecast-title" aria-live="polite">
      <div className="section-head">
        <h2 id="forecast-title" className="section-title">Prognosen</h2>
        <span className={s.forecastScope}>Für den zusätzlichen Ausbau · {years} Jahre</span>
      </div>

      <div className={s.kpiGrid}>
        <Kpi icon="wallet" title="Erforderliche Investition" value={f && fmtMio(f.investment_eur)}
          note={f && `Einmalig zum Start · ${fmtMwp(f.new_power_mwp)} zusätzlicher Ausbau`} />
        <Kpi icon="trending-up" highlight title={`Gewinn nach ${years} Jahren`} value={f && fmtMio(f.profit_eur)}
          note="Nach Investition und Betriebskosten des zusätzlichen Ausbaus" />
        <Kpi icon="zap" title="Gesamte Stromerzeugung" value={f && `${fmtInt(f.energy_total_mwh)} MWh`}
          note={`Gesamtenergie über ${years} Jahre`} />
        <Kpi icon="zap" title="Stromerzeugung pro Jahr" value={f && `${fmtInt(f.energy_per_year_mwh)} MWh/Jahr`}
          note="Durchschnittliche Jahresproduktion" />
        <Kpi icon="timer" title="Amortisationsdauer"
          value={f && (f.amortization_years == null ? "nicht erreicht" : `${fmtFlex(f.amortization_years, 1)} Jahre`)}
          note={f && f.amortization_years == null ? "Erträge decken die Betriebskosten nicht" : "Ab dann ist die Investition gedeckt"} />
        <Kpi icon="leaf" title={`CO₂-Einsparung in ${years} Jahren`} value={f && `${fmtInt(f.co2_savings_t_total)} t`}
          note={f && `${fmtInt(f.co2_savings_t_per_year)} t pro Jahr · modellhaft`} />
      </div>

      {f && (
        <p className={s.yearBalance}>
          <img src="/icons/zap-small.svg" width={13} height={13} alt="" />
          <span>
            {fmtFlex(f.energy_per_year_mwh / 1000, 1)} GWh/Jahr · {fmtMio(f.electricity_value_eur_per_year)} Stromwert −{" "}
            {fmtMio(f.operating_cost_eur_per_year)} Betriebskosten · zusätzlicher Ausbau
          </span>
        </p>
      )}
    </section>
  );
}

function Kpi({ icon, title, value, note, highlight }) {
  return (
    <div className={`${s.kpi} ${highlight ? s.kpiHighlight : ""}`}>
      <div className={s.kpiHead}>
        <span>{title}</span>
        <img src={`/icons/${icon}.svg`} width={15} height={15} alt="" />
      </div>
      <span className={s.kpiValue}>{value ?? "–"}</span>
      <span className={s.kpiNote}>{note}</span>
    </div>
  );
}

/* ---------------- Entwicklung im Zeitverlauf ---------------- */
function Development({ forecast: f, config, isExample }) {
  const solarGwh = f ? f.energy_per_year_mwh / 1000 : 0;
  const restGwh = f ? Math.max(f.consumption_gwh_per_year - solarGwh, 0) : 0;
  const growthMax = f ? Math.max(f.existing_power_mwp, f.new_power_mwp, 0.001) : 1;

  return (
    <section className={`card ${s.development}`} aria-labelledby="dev-title">
      <div className="section-head">
        <h2 id="dev-title" className="section-title">Entwicklung im Zeitverlauf</h2>
        {f && config && (
          <span className={s.scenario}>
            <span className={s.scenarioLine} aria-hidden="true" />
            Szenario: {fmtPct(config.target_utilization_pct)} Gesamtdeckung · {fmtMwp(f.new_power_mwp)} zusätzlicher
            Ausbau · {config.horizon_years} Jahre
          </span>
        )}
      </div>

      <div className={s.charts}>
        <div className={s.financeChart}>
          <div className={s.chartTitle}>
            <span>Finanzielle Entwicklung</span>
            <span className="note">Kumulierter Saldo in Mio. €</span>
          </div>
          <BalanceChart timeline={f?.timeline} amortizationYears={f?.amortization_years} investmentEur={f?.investment_eur ?? 0} />
        </div>

        <div className={s.divider} aria-hidden="true" />

        <div className={s.sideCharts}>
          <div className={s.sideChart}>
            <div className={s.sideChartHead}>
              <span className={s.sideChartTitle}>Stromverbrauch</span>
              <span className="note">Jährlicher Stromverbrauch{isExample ? " · Beispiel" : ""}</span>
            </div>
            <div className={s.consumption}>
              <Donut
                size={84}
                thickness={14}
                label="Anteil Solarstrom am Jahresverbrauch"
                segments={[
                  { key: "solar", value: solarGwh, color: "var(--pf-blue)" },
                  { key: "rest", value: restGwh, color: "var(--border-strong)" },
                ]}
              >
                <span className={s.donutValue}>{f ? `${fmtInt(f.consumption_gwh_per_year)} GWh` : "–"}</span>
                <span className={s.donutSub}>pro Jahr</span>
              </Donut>
              <ul className={s.legend}>
                <li>
                  <i style={{ background: "var(--pf-blue)" }} />
                  Solar: {fmtFlex(solarGwh, 1)} GWh · {fmtPct(f?.solar_share_pct ?? 0)}
                </li>
                <li className={s.legendMuted}>
                  <i style={{ background: "var(--border-strong)" }} />
                  Übrig: {fmtFlex(restGwh, 1)} GWh · {fmtPct(100 - (f?.solar_share_pct ?? 0))}
                </li>
              </ul>
              <p className={s.consumptionHint}>{isExample ? "Beispiel · " : ""}Solarstrom vollständig lokal genutzt</p>
            </div>
          </div>

          <div className={s.sideChart}>
            <div className={s.sideChartHead}>
              <span className={s.sideChartTitle}>PV-Zuwachs</span>
              <span className="note">Bestand · Ziel · Zubau</span>
            </div>
            <div className={s.growth}>
              <span className={s.growthTarget}>{f ? fmtMwp(f.target_power_mwp) : "–"}</span>
              <span className="note">Zieldeckung {config ? fmtPct(config.target_utilization_pct) : "–"}</span>
              <div className={s.growthBar} style={{ "--w": `${f ? (f.existing_power_mwp / growthMax) * 100 : 100}%` }}>
                <span>{f ? fmtMwp(f.existing_power_mwp) : "–"} bestehend</span>
              </div>
              <div className={`${s.growthBar} ${s.growthBarNew}`} style={{ "--w": `${f ? (f.new_power_mwp / growthMax) * 100 : 100}%` }}>
                <span>+{f ? fmtMwp(f.new_power_mwp) : "–"} Zubau</span>
              </div>
              <span className="note">{f ? fmtMwp(f.potential_power_mwp) : "–"} Gesamtpotenzial</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Annahmen & Datengrundlage ---------------- */
function Assumptions({ forecast: f, config, isExample }) {
  if (!f || !config) return null;
  const a = f.assumptions;
  return (
    <footer className={s.footer}>
      <p className="footnote">
        {isExample ? "Beispielannahmen" : "Annahmen"}: {fmtMwp(f.potential_power_mwp)} Gesamtpotenzial ·{" "}
        {fmtInt(a.investment_eur_per_kwp)} €/kWp Investition · {fmtInt(a.specific_yield_kwh_per_kwp)} kWh/kWp pro Jahr ·
        Betriebskosten {fmtFlex(a.operating_cost_pct_of_investment, 1)} % der Investition/Jahr ·{" "}
        {fmtFlex(a.co2_kg_per_kwh, 2)} kg CO₂/kWh · {fmtMwp(f.existing_power_mwp)} Bestand ·{" "}
        {fmtPct(config.target_utilization_pct)} Zieldeckung · {fmtMwp(f.new_power_mwp)} zusätzlicher Ausbau.
        <br />
        Gesamter Solarstrom zum gewählten Strompreis bewertet; konstante Erträge und Preise, ohne Zinsen, Steuern und
        Degradation. Prognosen beziehen sich ausschließlich auf den zusätzlichen Ausbau, nicht auf die bereits
        installierten Anlagen.{isExample ? " Keine verifizierten Pforzheimer Bestandsdaten." : ""}
      </p>
      <p className={`footnote ${s.dataBasis}`}>
        Datengrundlage: {isExample ? "Beispielwerte und Modellannahmen · " : ""}
        {fmtMwp(f.existing_power_mwp)} Bestand · {fmtPct(config.target_utilization_pct)} Zieldeckung ·{" "}
        {fmtMwp(f.new_power_mwp)} zusätzlicher Ausbau
        {isExample ? " · keine verifizierten Bestandsdaten für Pforzheim" : ""}
      </p>
    </footer>
  );
}
