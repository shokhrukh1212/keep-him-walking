import { ShareOnXLink } from "@/components/share/ShareOnXLink";

/** A country page's share control: a prefilled X draft the visitor posts themselves. */
export function CountryShareButton({ text }: { code?: string; text: string }) {
  return <ShareOnXLink text={text} />;
}
