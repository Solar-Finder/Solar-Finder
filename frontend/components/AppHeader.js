"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppHeader.module.css";

/**
 * Kopfzeile: offizielles „Signet mit Zusatz“ (PF + Signet + „Stadt Pforzheim“) links,
 * Navigation rechts. Schwarz auf hellem Grund, mit Schutzzone
 * (½ Wappenhöhe oben/unten, 1 Wappenbreite seitlich).
 * Signet extrahiert aus dem CD-Manual, S. 23 („offizielle Form“) – nicht verändern.
 */
export default function AppHeader() {
  const onMap = usePathname()?.startsWith("/karte");

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.signet} aria-label="Stadt Pforzheim – Startseite">
        <img src="/brand/stadt-pforzheim-signet.svg" alt="Stadt Pforzheim" />
      </Link>

      <nav className={styles.nav} aria-label="Bereiche">
        <Link href="/" className={`${styles.tab} ${!onMap ? styles.tabActive : ""}`} aria-current={!onMap ? "page" : undefined}>
          Rechner
        </Link>
        <Link href="/karte" className={`${styles.tab} ${onMap ? styles.tabActive : ""}`} aria-current={onMap ? "page" : undefined}>
          Karte
        </Link>
      </nav>
    </header>
  );
}
