import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";
import { seasonSponsorXUrl, sponsorshipMode } from "@/lib/config/sponsorship";
import { demoSponsorAllowed, demoSponsorLogoAllowed } from "@/lib/traveler/demo-sponsor";
import { configuredCoffeeUrl } from "@/lib/supporters/config";

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
    sponsorshipMode={sponsorshipMode()}
    sponsorXUrl={seasonSponsorXUrl()}
    coffeeUrl={configuredCoffeeUrl(process.env.BUY_ME_A_COFFEE_URL)}
  />;
}
