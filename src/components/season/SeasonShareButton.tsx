import { ShareOnXLink } from "@/components/share/ShareOnXLink";

/** The season sheet's share control: a prefilled X draft the visitor posts themselves. */
export function SeasonShareButton({ text }: { seasonNumber?: number; text: string }) {
  return <ShareOnXLink text={text} className="primary-button" />;
}
