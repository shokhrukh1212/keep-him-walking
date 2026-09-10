import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";
import { demoSponsorAllowed, demoSponsorLogoAllowed } from "@/lib/traveler/demo-sponsor";
import { loadSponsorWindow, nextOpenPriceCents } from "@/lib/sponsors/data";

// The landing page stays cacheable: no cookies, no search params, one indexed
// read for the advertised price. Anything visitor-specific arrives via /api/bootstrap.
export const revalidate = 60;

export default async function HomePage() {
  const window = await loadSponsorWindow();
  return <JourneyExperience
    initialSnapshot={offlineBootstrapSnapshot()}
    previewDemoSponsor={demoSponsorAllowed(process.env)}
    allowDemoSponsorLogo={demoSponsorLogoAllowed(process.env)}
    // The dock never invents a price: with no open day it shows no number at all.
    sponsorPriceCents={nextOpenPriceCents(window)}
  />;
}
