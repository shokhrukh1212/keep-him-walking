import type { Metadata } from "next";
import Link from "next/link";
import { AdminSignIn } from "@/components/admin/AdminSignIn";

export const metadata: Metadata = { title: "Admin sign-in — Keep Him Walking", robots: { index: false, follow: false } };

export default function AdminLoginPage() {
  return <main className="content-page">
    <Link href="/">← Return to the walk</Link>
    <h1>Admin sign-in</h1>
    <p>Use your private access secret to open the post kit. Your session lasts 12 hours.</p>
    <AdminSignIn />
  </main>;
}
