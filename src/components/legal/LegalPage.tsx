import Link from "next/link";
import type { ReactNode } from "react";
import { LegalFooter } from "./LegalFooter";
import styles from "@/app/public-pages.module.css";

export const LEGAL_EFFECTIVE_DATE = "14 September 2026";

export function LegalPage({
  title,
  eyebrow,
  summary,
  children,
  testId,
}: {
  title: string;
  eyebrow: string;
  summary: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  const titleId = `${testId}-title`;
  return (
    <main className={styles.publicPage} data-testid={testId}>
      <div className={`${styles.pageFrame} ${styles.legalFrame}`}>
        <header className={styles.siteHeader}>
          <Link className={styles.backLink} href="/">← Return to the walk</Link>
          <span className={styles.wordmark}>KEEP HIM WALKING</span>
        </header>

        <section className={styles.legalHero} aria-labelledby={titleId}>
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1 id={titleId}>{title}</h1>
          <p>{summary}</p>
          <p className={styles.policyDates}>Effective {LEGAL_EFFECTIVE_DATE} · Last updated {LEGAL_EFFECTIVE_DATE}</p>
        </section>

        <article className={`${styles.legalArticle} ${styles.legalArticleStack}`} aria-labelledby={titleId}>
          {children}
        </article>

        <LegalFooter lead="Keep Him Walking" />
      </div>
    </main>
  );
}
