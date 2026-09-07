import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";
import { demoSponsorAllowed } from "@/lib/traveler/demo-sponsor";

export default function HomePage() {
  return <JourneyExperience initialSnapshot={offlineBootstrapSnapshot()} previewDemoSponsor={demoSponsorAllowed(process.env)} />;
}
