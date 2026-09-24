import { permanentRedirect } from "next/navigation";

/** New sponsor sales are paused; historical receipt and request URLs remain separate. */
export default function SponsorsPage() {
  permanentRedirect("/");
}
