import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonSponsorQueue } from "@/components/admin/SeasonSponsorQueue";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadAdminSeasonBookings } from "@/lib/sponsors/season-data";

export const dynamic = "force-dynamic";

export default async function SeasonSponsorsAdminPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) notFound();
  const bookings = await loadAdminSeasonBookings();
  return <main className="content-page admin-page">
    <Link href="/admin">← Private operations</Link>
    <span className="eyebrow">PRIVATE SEASON SPONSORS</span>
    <h1>Season sponsors</h1>
    <p>
      Contact details and unreviewed logos appear only here. Approving material is a content check;
      it is not evidence that the payment provider accepts this business.
    </p>
    <SeasonSponsorQueue bookings={bookings} />
  </main>;
}
