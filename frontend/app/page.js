"use client";

import { useEffect, useMemo, useState } from "react";
import RangeSlider from "@/components/RangeSlider";
import BalanceChart from "@/components/BalanceChart";
import Donut from "@/components/Donut";
import InfoTip from "@/components/InfoTip";
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
  // Modellannahmen (Verbrauch, Kosten …) sind noch Beispielwerte
  const isExample = forecast?.data_status === "example";

  return (
    <div className="page">
      {error && <div className="error-banner" role="alert">{error}</div>}

      <Overview status={status} />

      <div className={s.inputsResults}>
        <Configuration meta={meta} config={config} forecast={forecast} set={set} onReset={() => setConfig(defaultConfig(meta))} />
        <Forecasts forecast={forecast} years={config?.horizon_years} price={config?.electricity_price_ct_per_kwh} />
      </div>

      <Development forecast={forecast} config={config} isExample={isExample} />
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
        <Stat
          label={status?.potential_status === "estimated" ? "Potenziell (geschätzt)" : "Potenziell"}
          value={status && fmtMwp(status.potential_power_mwp)}
        />
        <Stat label="Gedeckt" value={status && fmtPct(status.utilization_pct, 1)} highlight />
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
  const price = meta.electricity_price;
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
        info={
          <InfoTip label="Strompreis">
            <Formula>Ausgangswert: {fmtFlex(price.value_ct_per_kwh, 1)} ct/kWh</Formula>
            {price.is_example ? (
              <Assumption>Beispielwert – der Strompreis konnte nicht abgerufen werden</Assumption>
            ) : (
              <>
                <Assumption>Quelle: {price.source}, Lizenz CC BY 4.0</Assumption>
                <Assumption>
                  Abruf über die SMARD-Marktdaten (smard.de), Jahresmittel des letzten abgeschlossenen Kalenderjahres
                </Assumption>
              </>
            )}
            <Meaning>
              Day-Ahead-Großhandelspreis der Gebotszone DE/LU, gemittelt über alle Stunden des Jahres – kein
              Endkundenpreis. Der Jahresmittelwert gleicht die starken Tagesschwankungen aus. Der Regler startet mit
              diesem Wert und lässt sich frei anpassen; „Zurücksetzen“ stellt ihn wieder her. In der Rechnung steigt der
              Preis ab dem 2. Jahr um 0,6 ct/kWh pro Jahr.
            </Meaning>
          </InfoTip>
        }
        value={config.electricity_price_ct_per_kwh}
        {...pick(sl.electricity_price_ct_per_kwh)}
        onChange={set("electricity_price_ct_per_kwh")}
        display={`${fmtFlex(config.electricity_price_ct_per_kwh, 1)} ct/kWh`}
        rangeLabels={[`${sl.electricity_price_ct_per_kwh.min} ct`, `${sl.electricity_price_ct_per_kwh.max} ct`]}
      />
    </section>
  );
}

const pick = ({ min, max, step }) => ({ min, max, step });

/* ---------------- Überschlagsrechnungen ---------------- */
function Forecasts({ forecast: f, years: horizon, price }) {
  const years = horizon ?? "–";
  const info = forecastInfo(f, horizon, price);
  return (
    <section className={`card ${s.forecast}`} aria-labelledby="forecast-title" aria-live="polite">
      <div className="section-head">
        <h2 id="forecast-title" className="section-title">Überschlagsrechnungen</h2>
        <span className={s.forecastScope}>Für den zusätzlichen Ausbau · {years} Jahre</span>
      </div>

      <div className={s.kpiGrid}>
        <Kpi icon="wallet" title="Erforderliche Investition" value={f && fmtMio(f.investment_eur)} info={info.investment}
          note={f && `${fmtMio(f.purchase_cost_eur)} Anschaffung + ${fmtMio(f.maintenance_cost_total_eur)} Instandhaltung (${years} J.) · ${fmtMwp(f.new_power_mwp)} Zubau`} />
        <Kpi icon="trending-up" highlight title={`Gewinn nach ${years} Jahren`} value={f && fmtMio(f.profit_eur)} info={info.profit}
          note="Stromwert im Zeitraum abzüglich Investition (inkl. Instandhaltung)" />
        <Kpi icon="zap" title="Gesamte Stromerzeugung" value={f && `${fmtInt(f.energy_total_mwh)} MWh`} info={info.energyTotal}
          note={`Gesamtenergie über ${years} Jahre`} />
        <Kpi icon="zap" title="Stromerzeugung pro Jahr" value={f && `${fmtInt(f.energy_per_year_mwh)} MWh/Jahr`} info={info.energyYear}
          note="Durchschnittliche Jahresproduktion" />
        <Kpi icon="timer" title="Amortisationsdauer" info={info.amortization}
          value={f && (f.amortization_years == null ? "nicht erreicht" : `${fmtFlex(f.amortization_years, 1)} Jahre`)}
          note={f && f.amortization_years == null ? "Stromwert deckt die Anschaffung nicht" : "Ab dann sind die Anschaffungskosten gedeckt"} />
        <Kpi icon="leaf" title={`CO₂-Einsparung in ${years} Jahren`} value={f && `${fmtInt(f.co2_savings_t_total)} t`} info={info.co2}
          note={f && `${fmtInt(f.co2_savings_t_per_year)} t pro Jahr · modellhaft`} />
      </div>

      {f && (
        <p className={s.yearBalance}>
          <img src="/icons/zap-small.svg" width={13} height={13} alt="" />
          <span>
            {fmtFlex(f.energy_per_year_mwh / 1000, 1)} GWh/Jahr · Ø {fmtMio(f.electricity_value_eur_per_year)} Stromwert pro Jahr ·{" "}
            Instandhaltung {fmtMio(f.operating_cost_eur_per_year)} pro Jahr (in der Investition enthalten) · zusätzlicher Ausbau
          </span>
        </p>
      )}
    </section>
  );
}

/**
 * Info-Texte der Überschlagsrechnungen: Formel (wie in backend/app/data_service.py → forecast) mit den
 * aktuellen Annahmen aus der API und eine kurze Einordnung. Beispielwerte sind gekennzeichnet.
 */
function forecastInfo(f, years, price) {
  const a = f?.assumptions;
  const ex = (key) => (a?.status?.[key] === "example" ? " (Beispielwert)" : "");
  const n = years ?? "Jahre";
  const zubau = <Assumption>Zubau = Zielauslastung × Dachpotenzial − Bestand (Gebäudesolaranlagen laut MaStR)</Assumption>;
  const deg = fmtFlex(a?.degradation_pct_per_year ?? 0.25, 2);
  const alterung = (
    <Assumption>
      Alterung: Ertrag im Jahr t = Ertrag im 1. Jahr × (1 − {deg} %)^(t − 1) (Energieatlas BW)
    </Assumption>
  );
  return {
    investment: (
      <>
        <Formula>Investition = Anschaffung + Instandhaltung über {n} Jahre</Formula>
        <Assumption>
          Anschaffung = Zubau × {a ? `${fmtInt(a.investment_eur_per_kwp)} €/kWp` : "–"}
          {ex("investment_eur_per_kwp")}
        </Assumption>
        <Assumption>
          Instandhaltung = {a ? `${fmtFlex(a.operating_cost_pct_of_investment, 1)} %` : "–"} der Anschaffung × {n} Jahre
        </Assumption>
        {zubau}
        <Meaning>
          Gesamte Kosten des Ausbaus im Zeitraum; der Gewinn zieht sie vom Stromwert ab. Die Amortisation rechnet nur mit
          der Anschaffung.
        </Meaning>
      </>
    ),
    profit: (
      <>
        <Formula>Gewinn = Σ Jahr 1…{n} Stromwert − Investition (inkl. Instandhaltung)</Formula>
        <Assumption>
          Stromwert im Jahr t = Stromerzeugung im Jahr t × Strompreis im Jahr t
        </Assumption>
        <Assumption>
          Strompreis im Jahr t = {price != null ? `${fmtFlex(price, 1)} ct/kWh` : "Ausgangswert"} +{" "}
          {fmtFlex(a?.price_increase_ct_per_kwh_per_year ?? 0.6, 1)} ct/kWh × (t − 1) (Energieatlas BW)
        </Assumption>
        {alterung}
        <Meaning>
          Zeigt, ob sich der Ausbau im Zeitraum wirtschaftlich lohnt. Vereinfacht: ohne Zinsen, Steuern und Förderung.
        </Meaning>
      </>
    ),
    energyTotal: (
      <>
        <Formula>Gesamte Stromerzeugung = Σ Jahr 1…{n} Stromerzeugung im Jahr t</Formula>
        {alterung}
        <Meaning>Gesamter Beitrag des Zubaus im Zeitraum; durch die Alterung sinkt der Ertrag leicht von Jahr zu Jahr.</Meaning>
      </>
    ),
    energyYear: (
      <>
        <Formula>Stromerzeugung pro Jahr = Gesamte Stromerzeugung ÷ {n} (Durchschnitt)</Formula>
        <Assumption>Stromerzeugung im 1. Jahr = Zubau × spezifischer Ertrag, danach Alterung um {deg} % pro Jahr</Assumption>
        <Assumption>
          Spezifischer Ertrag: {a ? `${fmtInt(a.specific_yield_kwh_per_kwp)} kWh/kWp` : "–"} (LUBW, Mittel aller
          PV-geeigneten Dachseiten)
        </Assumption>
        {zubau}
        <Meaning>Basis für Stromwert und CO₂-Einsparung; Vergleichsgröße zum Jahresverbrauch der Stadt.</Meaning>
      </>
    ),
    amortization: (
      <>
        <Formula>Amortisationsdauer = Zeitpunkt, ab dem Σ Stromwert ≥ Anschaffungskosten</Formula>
        <Assumption>Gerechnet nur mit der Anschaffung – die Instandhaltung zählt hier nicht</Assumption>
        <Assumption>
          Der Strompreis steigt jährlich um {fmtFlex(a?.price_increase_ct_per_kwh_per_year ?? 0.6, 1)} ct/kWh, der Ertrag
          sinkt durch Alterung um {deg} % pro Jahr; innerhalb des Jahres anteilig gerechnet
        </Assumption>
        <Meaning>
          Ab diesem Zeitpunkt sind die Anschaffungskosten zurückverdient. Je kürzer, desto geringer das finanzielle
          Risiko.
        </Meaning>
      </>
    ),
    co2: (
      <>
        <Formula>CO₂-Einsparung = Gesamte Stromerzeugung ({n} Jahre, mit Alterung) × CO₂-Faktor</Formula>
        <Assumption>
          CO₂-Faktor: {a ? `${fmtFlex(a.co2_kg_per_kwh, 3)} kg/kWh` : "–"} (aus dem LUBW-Datensatz: CO₂-Einsparung ÷
          Ertrag)
        </Assumption>
        <Meaning>Vermiedene Emissionen durch den Solarstrom – Maß für den Klimanutzen des Ausbaus.</Meaning>
      </>
    ),
  };
}

/** Info zum Diagramm „Finanzielle Entwicklung“: Rechnung mit Strompreissteigerung und Quelle */
function BalanceInfo({ forecast: f, config }) {
  const a = f?.assumptions;
  const inc = a?.price_increase_ct_per_kwh_per_year ?? 0.6;
  const p0 = config?.electricity_price_ct_per_kwh;
  const n = config?.horizon_years;
  const last = f?.timeline?.[f.timeline.length - 1];
  return (
    <>
      <Formula>Saldo im Jahr t = − Anschaffung + Σ Jahr 1…t Stromwert</Formula>
      <Assumption>Stromwert im Jahr t = Stromerzeugung im Jahr t × Strompreis im Jahr t</Assumption>
      <Assumption>
        Strompreis im Jahr t = {p0 != null ? `${fmtFlex(p0, 1)} ct/kWh` : "Ausgangswert"} + {fmtFlex(inc, 1)} ct/kWh × (t − 1)
        {last && n ? ` → im Jahr ${n}: ${fmtFlex(last.electricity_price_ct_per_kwh, 1)} ct/kWh` : ""}
      </Assumption>
      <Assumption>
        Alterung: Ertrag sinkt um {fmtFlex(a?.degradation_pct_per_year ?? 0.25, 2)} % pro Jahr (Energieatlas BW)
      </Assumption>
      <Assumption>
        Die Linie startet bei den Anschaffungskosten, ohne Instandhaltung – wie die Amortisation. Der Gewinn zieht
        zusätzlich die Instandhaltung ({a ? `${fmtFlex(a.operating_cost_pct_of_investment, 1)} %` : "–"} der Anschaffung ×{" "}
        {n ?? "N"} Jahre{f ? ` = ${fmtMio(f.maintenance_cost_total_eur)}` : ""}) ab und liegt daher unter dem Endwert.
      </Assumption>
      <Meaning>
        Wo die Linie die Nulllinie schneidet, ist die Anschaffung amortisiert. Vereinfacht: ohne Zinsen, Steuern und
        Förderung.
      </Meaning>
      <Assumption>
        Quelle Preissteigerung: {a?.price_increase_source ?? "Energieatlas Baden-Württemberg (LUBW)"} –{" "}
        {(a?.price_increase_url ?? "https://www.energieatlas-bw.de/sonne/gebaeude/grundlagen").replace("https://", "")}
        {" "}(Mittelwert mehrerer konservativer Schätzungen)
      </Assumption>
    </>
  );
}

const Formula = ({ children }) => <span className={s.infoFormula}>{children}</span>;
const Assumption = ({ children }) => <span className={s.infoLine}>{children}</span>;
const Meaning = ({ children }) => <span className={s.infoMeaning}>{children}</span>;

function Kpi({ icon, title, value, note, highlight, info }) {
  return (
    <div className={`${s.kpi} ${highlight ? s.kpiHighlight : ""}`}>
      <div className={s.kpiHead}>
        <span>
          {title}
          {info && <InfoTip label={title}>{info}</InfoTip>}
        </span>
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
            <span>
              Finanzielle Entwicklung
              <InfoTip label="Finanzielle Entwicklung">
                <BalanceInfo forecast={f} config={config} />
              </InfoTip>
            </span>
            <span className="note">Kumulierter Saldo der Anschaffung in Mio. €</span>
          </div>
          <BalanceChart timeline={f?.timeline} amortizationYears={f?.amortization_years} investmentEur={f?.purchase_cost_eur ?? 0} />
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
                size={120}
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
              <div className={s.growthBar}>
                <span>{f ? fmtMwp(f.existing_power_mwp) : "–"} bestehend</span>
              </div>
              <div className={`${s.growthBar} ${s.growthBarNew}`}>
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
