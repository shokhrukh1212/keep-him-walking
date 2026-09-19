import { permanentRedirect } from "next/navigation";

/** Legacy sponsor links return to the scene and open the featured placement. */
export default function SponsorPage() {
  permanentRedirect("/?placement=featured");
}
