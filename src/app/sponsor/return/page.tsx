import { PurchaseStatus } from "@/components/sponsor/PurchaseStatus";
import { notFound } from "next/navigation";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { legacyPurchasesOpen } from "@/lib/config/sponsorship";
import { PLACEMENT_ORDER_COOKIE } from "@/lib/sponsors/placement-cookie";

export default async function SponsorReturnPage({ searchParams }: { searchParams: Promise<{ purchase?: string }> }) {
  const cookieStore = await cookies();
  if (cookieStore.has(PLACEMENT_ORDER_COOKIE)) redirect("/");
  if (!legacyPurchasesOpen()) notFound();
  const { purchase } = await searchParams;
  return <main className="content-page"><a className="back-link" href="/sponsor">← Sponsorship</a><span className="eyebrow">THANK YOU</span><h1>Checkout is complete.</h1>{purchase && /^[0-9a-f-]{36}$/i.test(purchase) ? <PurchaseStatus purchase={purchase} /> : <p>The return link is incomplete. Contact us with your checkout receipt.</p>}</main>;
}
