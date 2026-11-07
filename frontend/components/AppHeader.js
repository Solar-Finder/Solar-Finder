"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppHeader.module.css";

/**
 * Kopfzeile nach CD-Manual Stadt Pforzheim:
 * „Signet mit Zusatz“ (PF + Signet + „Stadt Pforzheim“) in der rechten oberen Ecke,
 * schwarz auf hellem Grund, mit Schutzzone (½ Wappenhöhe oben/unten, 1 Wappenbreite seitlich).
 * Signet extrahiert aus dem Manual, S. 23 („offizielle Form“) – nicht verändern.
 */
export default function AppHeader() {
  const onMap = usePathname()?.startsWith("/karte");

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>
            <img src="/icons/sun.svg" width={21} height={21} alt="" />
          </span>
          <span className={styles.topic}>Solar-Ausbaurechner</span>
        </Link>

        <nav className={styles.nav} aria-label="Bereiche">
          <Link href="/" className={`${styles.tab} ${!onMap ? styles.tabActive : ""}`} aria-current={!onMap ? "page" : undefined}>
            Rechner
          </Link>
          <Link href="/karte" className={`${styles.tab} ${onMap ? styles.tabActive : ""}`} aria-current={onMap ? "page" : undefined}>
            Karte
          </Link>
        </nav>
      </div>

      <a href="https://www.pforzheim.de" className={styles.signet} aria-label="Stadt Pforzheim – zu pforzheim.de">
        <img src="/brand/stadt-pforzheim-signet.svg" alt="Stadt Pforzheim" />
      </a>
    </header>
  );
}
