import type { ReactNode } from "react";
import type { SponsorMarkName } from "@/lib/sponsors/places";

/**
 * REVIEW FIXTURE ONLY. Hand-drawn stand-ins so the five taken places have
 * something recognisable in them while the layout is looked at. These are not the
 * brands' own artwork and no brand has licensed anything here. A real sponsor
 * brings their own reviewed logo, and this file goes when they do.
 *
 * Each mark draws inside a 24x24 box and is decorative: the tile and the modal
 * carry the sponsor's name in text, so every mark is `aria-hidden`.
 */
function Mark({ children }: { children: ReactNode }) {
  return (
    <svg className="sponsor-mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const MARKS: Record<SponsorMarkName, ReactNode> = {
  google: (
    <>
      <g fill="none" strokeWidth="4">
        <path d="M19.37 6.84A9 9 0 0 1 17.16 19.37" stroke="#4285f4" />
        <path d="M17.16 19.37A9 9 0 0 1 4.63 17.16" stroke="#34a853" />
        <path d="M4.63 17.16A9 9 0 0 1 4.63 6.84" stroke="#fbbc05" />
        <path d="M4.63 6.84A9 9 0 0 1 19.37 6.84" stroke="#ea4335" />
      </g>
      <rect x="11.4" y="10" width="9.6" height="4" fill="#4285f4" />
    </>
  ),
  chatgpt: (
    <path
      d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6Zm0 4.4L8 9.8v4.4L12 16.4l4-2.2V9.8Z"
      fill="#10a37f"
    />
  ),
  claude: (
    <g stroke="#d97757" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" />
    </g>
  ),
  vercel: <path d="M12 4 21.5 20H2.5Z" fill="#0b0b0b" />,
  figma: (
    <>
      <path d="M9.4 3.4h2.9v4.2H9.4a2.1 2.1 0 0 1 0-4.2Z" fill="#f24e1e" />
      <path d="M12.3 3.4h2.3a2.1 2.1 0 0 1 0 4.2h-2.3Z" fill="#ff7262" />
      <path d="M9.4 7.9h2.9v4.2H9.4a2.1 2.1 0 0 1 0-4.2Z" fill="#a259ff" />
      <path d="M9.4 12.4h2.9v4.2H9.4a2.1 2.1 0 0 1 0-4.2Z" fill="#0acf83" />
      <circle cx="14.4" cy="12" r="2.6" fill="#1abcfe" />
    </>
  ),
};

/** The stand-in artwork for one taken place. */
export function SponsorPlaceMark({ mark }: { mark: SponsorMarkName }) {
  return <Mark>{MARKS[mark]}</Mark>;
}

/** An empty place: the one thing you can do with it is take it. */
export function SponsorPlusMark() {
  return (
    <svg className="sponsor-mark sponsor-mark-plus" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <path d="M12 5.5v13M5.5 12h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
