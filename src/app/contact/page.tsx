import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact and Support — Keep Him Walking",
  description: "Support for sponsor material, listings, refunds, privacy and accessibility.",
};

function configuredXContact(): { href: string; label: string } | null {
  const raw = process.env.NEXT_PUBLIC_SPONSOR_X_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !["x.com", "www.x.com"].includes(url.hostname)) return null;
    const handle = url.pathname.split("/").filter(Boolean)[0];
    return handle ? { href: url.toString(), label: `@${handle} on X` } : null;
  } catch {
    return null;
  }
}

export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
  const xContact = configuredXContact();
  return (
    <LegalPage
      title="Contact & Support"
      eyebrow="A REAL PERSON REVIEWS IT"
      testId="contact-page"
      summary="Use this page for sponsor material, listing reports, corrections, moderation appeals, cancellations, refunds, privacy requests and accessibility support."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>How to reach us</h2>
        {email ? <p>Email <a href={`mailto:${email}`}>{email}</a>.</p> : null}
        {xContact ? <p>Contact <a href={xContact.href} target="_blank" rel="noopener noreferrer">{xContact.label} ↗</a>.</p> : null}
        {!email && !xContact ? <p>No monitored public contact method is configured. Checkout remains disabled, and this must be resolved before accepting payment.</p> : null}
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>What to include</h2>
        <p>For a sponsor request, report, correction or appeal, include the sponsor name or destination URL and a short explanation. For a cancellation, refund or private-status question, include the unguessable sponsorship reference from your saved status page.</p>
        <p>Do not send passwords, payment-card details, identity documents or other sensitive information. Payment details are handled by the payment provider.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Related information</h2>
        <p>Read the <Link href="/content-moderation">Content and Listing Moderation Policy</Link> for listing reports and appeals, the <Link href="/refund-policy">Refund and Cancellation Policy</Link> for payment issues, and the <Link href="/privacy">Privacy Policy</Link> for data requests.</p>
      </section>
    </LegalPage>
  );
}
