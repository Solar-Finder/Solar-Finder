"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./AppHeader.module.css";

/** Kopfzeile: Navigation rechts auf hellem Grund. */
export default function AppHeader() {
  const onMap = usePathname()?.startsWith("/karte");

  return (
    <header className={styles.header}>
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
