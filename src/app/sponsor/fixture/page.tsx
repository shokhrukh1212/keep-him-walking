import { fixturePaymentsAllowed } from "@/lib/config/phase2-policy";

export default async function FixtureCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const query = await searchParams;
  const token = typeof query.token === "string" ? query.token : "";
  if (!fixturePaymentsAllowed() || !token) {
    return <main className="fixture-checkout"><h1>Test checkout unavailable</h1></main>;
  }
  return (
    <main className="fixture-checkout">
      <p className="fixture-label">PRIVATE PREVIEW FIXTURE</p>
      <h1>Test payment — no money</h1>
      <p>This deterministic adapter exercises the sponsor workflow without contacting a payment provider.</p>
      <form action="/api/sponsor/fixture/complete" method="post">
        <input type="hidden" name="token" value={token} />
        <button name="action" value="confirm" type="submit">Confirm test payment</button>
        <button name="action" value="cancel" type="submit">Cancel test checkout</button>
      </form>
    </main>
  );
}
