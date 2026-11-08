"use client";

import { useId } from "react";
import styles from "./RangeSlider.module.css";

/**
 * Schieberegler nach Mockup: Beschriftung + Wert-Pille, Spur, Wertebereich.
 * `children` wird zwischen Kopfzeile und Spur gerendert; `info` erscheint als „i“ neben der Beschriftung.
 */
export default function RangeSlider({ label, info, value, min, max, step = 1, onChange, display, rangeLabels, children }) {
  const id = useId();
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  return (
    <div className={styles.slider}>
      <div className={styles.head}>
        <span className={styles.labelWrap}>
          <label htmlFor={id} className={styles.label}>
            {label}
          </label>
          {info}
        </span>
        <output htmlFor={id} className={styles.value}>
          {display ?? value}
        </output>
      </div>
      {children}
      <input
        id={id}
        type="range"
        className={styles.range}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--fill": `${pct}%` }}
      />
      {rangeLabels && (
        <div className={styles.rangeLabels}>
          {rangeLabels.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}
