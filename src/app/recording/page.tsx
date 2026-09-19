import { notFound } from "next/navigation";
import { JourneyExperience } from "@/components/journey/JourneyExperience";
import { offlineBootstrapSnapshot } from "@/lib/bootstrap/offline";
import { seasonSponsorXUrl, sponsorshipMode } from "@/lib/config/sponsorship";

export const dynamic = "force-dynamic";

export default function RecordingPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <JourneyExperience
    initialSnapshot={offlineBootstrapSnapshot()}
    recordingMode
    sponsorshipMode={sponsorshipMode()}
    sponsorXUrl={seasonSponsorXUrl()}
  />;
}
