import Link from "next/link";

const POLICY_LINKS = [
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/refund-policy", "Refunds & cancellation"],
  ["/sponsor-terms", "Sponsor terms"],
  ["/content-moderation", "Content moderation"],
  ["/faq", "FAQ"],
  ["/contact", "Contact & support"],
] as const;

export function LegalFooter({
  variant = "page",
  lead,
}: {
  variant?: "page" | "landing";
  lead?: string;
}) {
  return (
    <footer
      className={`global-legal-footer global-legal-footer-${variant}`}
      data-testid={`${variant}-legal-footer`}
    >
      {lead ? <span>{lead}</span> : null}
      <nav aria-label="Legal and support">
        {POLICY_LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
    </footer>
  );
}
