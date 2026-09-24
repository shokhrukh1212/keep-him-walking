import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = { title: "FAQ — Keep Him Walking", description: "Answers about Milo's Paris launch and the free viewing experience." };

export default function FaqPage() {
  return <LegalPage title="Frequently asked questions" eyebrow="PARIS RELAUNCH" testId="faq-page"
    summary="Short answers about Milo's Paris launch and how watching keeps him moving.">
    <section><span className="legal-section-number">01</span><h2>When does he start?</h2>
      <p>The page shows a start only when the shared journey has a confirmed schedule. At launch, the 14-day calendar period begins. Milo makes walking progress only while at least one ready, visible visitor is watching.</p></section>
    <section><span className="legal-section-number">02</span><h2>Do I need an account or payment?</h2>
      <p>No. Opening the journey, watching, reacting, voting and sharing are free. New sponsor purchases are paused.</p></section>
    <section><span className="legal-section-number">03</span><h2>What happens when everybody leaves?</h2>
      <p>His walking progress pauses after the final viewer&apos;s short presence lease expires. The city clock continues, and he can walk again when a viewer returns.</p></section>
    <section><span className="legal-section-number">04</span><h2>What does the visitor number mean?</h2>
      <p>When people are watching, the header shows the larger of the server-confirmed watcher count and the recent site visitor count. When both are zero, it shows the confirmed all-time unique visitor count instead. These counts do not set his walking speed.</p></section>
    <section><span className="legal-section-number">05</span><h2>Can I share the start?</h2>
      <p>Yes. Share on X opens a draft with the scheduled Paris time and this site&apos;s address. You decide whether to post it.</p></section>
  </LegalPage>;
}
