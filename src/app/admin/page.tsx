import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authenticated = validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value);
  if (!authenticated) notFound();
  return (
    <main className="content-page admin-page">
      <span className="eyebrow">PRIVATE OPERATIONS</span>
      <h1>Post kit</h1>
      <p>Your 12-hour admin session is active.</p>
      <p><Link href="/admin/corrections">Review private corrections</Link></p>
      <nav className="admin-day-links" aria-label="Post kits">
        {Array.from({ length: 30 }, (_, index) => <Link key={index + 1} href={`/admin/postkit/${index + 1}`}>Day {index + 1}</Link>)}
      </nav>
    </main>
  );
}
