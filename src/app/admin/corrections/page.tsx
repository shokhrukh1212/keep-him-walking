import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CorrectionQueue } from "@/components/admin/CorrectionQueue";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadCorrections } from "@/lib/corrections/data";

export const dynamic = "force-dynamic";

export default async function CorrectionsPage() {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) notFound();
  const rows = await loadCorrections("new");
  return <main className="content-page admin-page">
    <Link href="/admin">← Private operations</Link>
    <span className="eyebrow">PRIVATE CORRECTIONS</span>
    <h1>Corrections to review</h1>
    <p>Visitor text appears only here. Accepting a note credits its anonymous contributor; it does not edit a country pack.</p>
    <CorrectionQueue initialRows={rows} />
  </main>;
}
