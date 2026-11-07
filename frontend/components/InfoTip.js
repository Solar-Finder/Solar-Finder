"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./InfoTip.module.css";

const WIDTH = 240; // muss zu .tip { width } passen
const GAP = 6;
const MARGIN = 8; // Mindestabstand zum Fensterrand

/**
 * Kleines „i“ im Kreis neben einer Überschrift; zeigt `children` beim Überfahren oder Fokussieren.
 * Der Text wird per Portal in <body> gerendert, damit scrollende Container ihn nicht abschneiden.
 * label: Name der Überschrift (für Screenreader: „Info: <label>“)
 */
export default function InfoTip({ label, children }) {
  const id = useId();
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const show = () => {
    const r = ref.current.getBoundingClientRect();
    const left = Math.max(MARGIN, Math.min(r.left - 12, window.innerWidth - WIDTH - MARGIN));
    setPos({ left, top: r.bottom + GAP });
  };
  const hide = () => setPos(null);

  // Beim Scrollen würde der Text sonst an der alten Stelle stehen bleiben
  useEffect(() => {
    if (!pos) return;
    const onKey = (e) => e.key === "Escape" && hide();
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [pos]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        className={styles.icon}
        aria-label={`Info: ${label}`}
        aria-describedby={pos ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        // Klick (z. B. auf Touch-Geräten) schaltet um; verhindert, dass ein umgebendes <label> reagiert
        onClick={(e) => {
          e.preventDefault();
          pos ? hide() : show();
        }}
      >
        i
      </button>
      {pos &&
        createPortal(
          <div id={id} role="tooltip" className={styles.tip} style={{ left: pos.left, top: pos.top }}>
            {children}
          </div>,
          document.body
        )}
    </>
  );
}
