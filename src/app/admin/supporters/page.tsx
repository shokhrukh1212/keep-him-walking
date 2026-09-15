import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SupporterAdmin } from "@/components/admin/SupporterAdmin";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadAdminSupporters } from "@/lib/supporters/data";

export const dynamic = "force-dynamic";

export default async function SupportersAdminPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) notFound();
  const rows = await loadAdminSupporters();
  return <main className="content-page admin-page">
    <Link href="/admin">← Private operations</Link>
    <span className="eyebrow">PRIVATE SUPPORTER RECORDS</span>
    <h1>Supporter acknowledgments</h1>
    <p>Payment identifiers, emails and messages stay on this protected page. Public acknowledgment always requires verification and separate permission.</p>
    <SupporterAdmin initialRows={rows} />
  </main>;
}
