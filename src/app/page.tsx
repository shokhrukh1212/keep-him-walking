import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";

export default function HomePage() {
  return <JourneyExperience initialSnapshot={offlineBootstrapSnapshot()} />;
}
