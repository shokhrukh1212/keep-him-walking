import Link from "next/link";
import styles from "../public-pages.module.css";

export default function PrivacyPage() {
  return <main className={`${styles.publicPage} ${styles.privacyPage}`} data-testid="privacy-page">
    <div className={`${styles.pageFrame} ${styles.legalFrame}`}>
      <header className={styles.siteHeader}>
        <Link className={styles.backLink} href="/">← Return to the walk</Link>
        <span className={styles.wordmark}>KEEP HIM WALKING</span>
      </header>

      <section className={styles.legalHero} aria-labelledby="privacy-title">
        <span className={styles.eyebrow}>YOUR DATA</span>
        <h1 id="privacy-title">Privacy</h1>
        <p>Keep Him Walking uses a first-party, HttpOnly anonymous visitor cookie to prevent duplicate presence, votes, postcard claims and sponsor metrics. The cookie is not an account and is never placed in a public postcard URL.</p>
      </section>

      <article className={styles.legalArticle} aria-labelledby="privacy-title">
        <section>
          <span className={styles.sectionNumber}>01</span>
          <h2>Anonymous by design</h2>
          <p>To stop automated spam, each Wave, Water or Photo request, and each sponsorship request, also counts against a short limit keyed by a one-way hash of the network address it came from. The address itself is never stored.</p>
          <p>Day-scoped contribution hashes are retained for up to 400 days. Public postcard assets use unpredictable tokens and expire after 365 days. Existing payment records are preserved.</p>
        </section>
        <section>
          <span className={styles.sectionNumber}>02</span>
          <h2>Sponsorship requests</h2>
          <p>A season sponsorship request stores the product name, website, short description and logo you submit, and your contact name and email, privately. Only material we approve is published; your contact details never are. Card and billing details are handled by the payment processor and never reach this site.</p>
        </section>
        <section>
          <span className={styles.sectionNumber}>03</span>
          <h2>Corrections and analytics</h2>
          <p>Apart from sponsor material, the corrections form is the only place visitor-written text is stored. A correction, its broad category, the city-pack reference, a two-letter country code and the anonymous visitor hash stay in a private moderation queue. The text is never published; only a confirmed count of distinct accepted contributors can appear publicly.</p>
          <p>Vemetric receives non-blocking product events. Live walking, counts, voting, payments and sponsorship decisions never depend on analytics delivery.</p>
        </section>
      </article>

      <footer className={styles.legalContact}>
        <span className={styles.eyebrow}>QUESTIONS OR REMOVAL REQUESTS</span>
        <p>For access or removal questions, use the <Link href="/contact">contact page</Link>.</p>
      </footer>
    </div>
  </main>;
}
