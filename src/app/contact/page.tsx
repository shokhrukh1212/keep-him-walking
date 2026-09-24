import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Contact and Support — Keep Him Walking",
  description: "Support for the journey, privacy, accessibility and earlier purchases.",
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
      summary="Use this page for journey questions, privacy requests, accessibility support and earlier purchase issues."
    >
      <section>
        <span className="legal-section-number">01</span>
        <h2>How to reach us</h2>
        {email ? <p>Email <a href={`mailto:${email}`}>{email}</a>.</p> : null}
        {xContact ? <p>Contact <a href={xContact.href} target="_blank" rel="noopener noreferrer">{xContact.label} ↗</a>.</p> : null}
        {!email && !xContact ? <p>No monitored public contact method is configured yet. The journey remains free to watch.</p> : null}
      </section>

      <section>
        <span className="legal-section-number">02</span>
        <h2>What to include</h2>
        <p>For a journey question, describe what happened and when. For an earlier purchase, include its private reference and the original promise if available.</p>
        <p>Do not send passwords, payment-card details, identity documents or other sensitive information. Payment details are handled by the payment provider.</p>
      </section>

      <section>
        <span className="legal-section-number">03</span>
        <h2>Related information</h2>
        <p>Read the <Link href="/faq">FAQ</Link> for viewing questions and the <Link href="/privacy">Privacy Policy</Link> for data requests. Earlier purchasers can request the policy that applied to their transaction.</p>
      </section>
    </LegalPage>
  );
}
