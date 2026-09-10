import { permanentRedirect } from "next/navigation";

/** The sponsor page is now the public price board at /sponsors. */
export default function SponsorPage() {
  permanentRedirect("/sponsors");
}
