import { permanentRedirect } from "next/navigation";

/**
 * The former auction/season-sales page is retired. Historical receipt and request URLs
 * remain separate routes; the public entry point now opens the fixed featured placement.
 */
export default function SponsorsPage() {
  permanentRedirect("/?placement=featured");
}
