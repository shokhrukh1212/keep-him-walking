import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "Content and Listing Moderation Policy — Keep Him Walking", description: "Review and prohibited-content rules for sponsor product names, logos, descriptions and destinations." };

export default function ContentModerationPage() {
  return <LegalPage title="Content and Listing Moderation Policy" eyebrow="SPONSOR MATERIAL" testId="content-moderation-page"
    summary="This policy covers every sponsor product name, logo, description and destination shown by Keep Him Walking.">
    <section><span className="legal-section-number">01</span><h2>How publication works</h2>
      <p>Valid material publishes promptly after verified payment. Automated policy checks send flagged material to a private pending-review state instead of publishing it; the buyer sees that review is pending. The owner may approve it or remove and refund it. Published material remains subject to reports and later review.</p></section>
    <section><span className="legal-section-number">02</span><h2>Rights and accuracy</h2>
      <p>Sponsors must own or have permission to use the submitted name, logo, description and destination. Material must identify the promoted product accurately, use supportable claims and match the destination. Evidence of rights or claims may be requested.</p></section>
    <section><span className="legal-section-number">03</span><h2>Prohibited material</h2>
      <p>Illegal, fraudulent, deceptive, infringing, hateful, sexually explicit, malicious, impersonating or unsafe content is prohibited, including phishing, malware, credential theft, privacy violations, piracy, fake engagement, weapons, gambling, drugs, tobacco/vapes, unsupported regulated services and anything restricted by law, card networks or the payment provider.</p>
      <p>Unsafe redirects or materially changing an approved destination to different content are also prohibited. The list is not exhaustive where removal is required for safety, provider rules or law.</p></section>
    <section><span className="legal-section-number">04</span><h2>Removal, reports and appeals</h2>
      <p>A reported placement may be hidden while checked. A placement removed under this policy receives a full refund. To report a listing or appeal a decision, use <Link href="/contact">Contact &amp; support</Link>, identify the product or destination and explain the concern without sending sensitive information.</p></section>
  </LegalPage>;
}
