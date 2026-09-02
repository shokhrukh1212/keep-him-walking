import "server-only";
import { Vemetric } from "@vemetric/node";

let client: Vemetric | null | undefined;

function getClient(): Vemetric | null {
  if (client !== undefined) return client;
  const token = process.env.NEXT_PUBLIC_VEMETRIC_TOKEN;
  client = token ? new Vemetric({ token }) : null;
  return client;
}

export function trackServerEvent(
  event:
    | "vote_submitted"
    | "postcard_created"
    | "rollover_completed"
    | "sponsor_checkout_started"
    | "sponsor_payment_confirmed"
    | "sponsor_refunded"
    | "sponsor_creative_approved",
  userIdentifier: string,
  eventData: Record<string, string | number | boolean | null>,
): void {
  const vemetric = getClient();
  if (!vemetric) return;
  void vemetric.trackEvent(event, { userIdentifier, eventData }).catch(() => undefined);
}
