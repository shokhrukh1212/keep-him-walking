import { xComposeUrl } from "@/lib/share/x-intent";

type Props = { text: string; className?: string };

/** Opens a prefilled X draft in a new tab. The visitor reviews it and posts it, or doesn't. */
export function ShareOnXLink({ text, className }: Props) {
  return (
    <a className={className ? `share-on-x ${className}` : "share-on-x"} href={xComposeUrl(text)} target="_blank" rel="noopener noreferrer">
      Share on X
    </a>
  );
}
