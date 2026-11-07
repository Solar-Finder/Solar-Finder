"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppHeader.module.css";

export default function AppHeader() {
  const onMap = usePathname()?.startsWith("/karte");

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Solar-Ausbaurechner Pforzheim – Startseite">
        <span className={styles.logo}>
          <img src="/icons/sun.svg" width={21} height={21} alt="" />
        </span>
        <span className={styles.city}>Pforzheim</span>
        <span className={styles.sep} aria-hidden="true">/</span>
        <span className={styles.topic}>Solar-Ausbaurechner</span>
      </Link>

      <nav className={styles.nav} aria-label="Bereiche">
        {/* Mockup: Rechner zeigt nur den Karten-Button, die Karte beide Tabs */}
        {onMap && (
          <Link href="/" className={styles.tab}>
            Rechner
          </Link>
        )}
        <Link href="/karte" className={`${styles.tab} ${styles.tabActive}`} aria-current={onMap ? "page" : undefined}>
          Karte
        </Link>
      </nav>
    </header>
  );
}
