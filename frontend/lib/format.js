/** Zahlenformatierung im deutschen Format. */

const nf = (min, max) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: min, maximumFractionDigits: max });
const int = nf(0, 0);

/** 1234567 → "1.234.567" */
export const fmtInt = (v) => int.format(Math.round(v ?? 0));

/** Zahl mit fester Nachkommastellenzahl */
export const fmtNum = (v, digits = 1) => nf(digits, digits).format(v ?? 0);

/** Zahl mit bis zu `digits` Nachkommastellen (keine überflüssigen Nullen) */
export const fmtFlex = (v, digits = 1) => nf(0, digits).format(v ?? 0);

/** Euro in Mio. €: 27000000 → "27,0 Mio. €", kleine Werte mit mehr Stellen (0,405) */
export const fmtMio = (eur, { sign = false } = {}) => {
  const mio = (eur ?? 0) / 1e6;
  const abs = Math.abs(mio);
  const s = abs !== 0 && abs < 1 ? nf(1, 3).format(mio) : fmtNum(mio, 1);
  return `${sign && mio > 0 ? "+" : ""}${s.replace("-", "−")} Mio. €`;
};

/** Leistung in MWp ohne überflüssige Nachkommastellen */
export const fmtMwp = (v) => `${fmtFlex(v, 1)} MWp`;

export const fmtPct = (v, digits = 0) => `${fmtFlex(v, digits)} %`;
