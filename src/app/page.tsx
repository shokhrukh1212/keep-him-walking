import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";
import { demoSponsorAllowed, demoSponsorLogoAllowed } from "@/lib/traveler/demo-sponsor";

// The landing page stays cacheable: no cookies, no search params, one indexed
// read for the advertised price. Anything visitor-specific arrives via /api/bootstrap.
export const revalidate = 60;

export default async function HomePage() {
  return <JourneyExperience
    initialSnapshot={offlineBootstrapSnapshot()}
    previewDemoSponsor={demoSponsorAllowed(process.env)}
    allowDemoSponsorLogo={demoSponsorLogoAllowed(process.env)}
    // Sponsor inventory is deliberately outside the launch-critical path.
    sponsorPriceCents={null}
  />;
}
