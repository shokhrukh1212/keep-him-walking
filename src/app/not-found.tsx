import Link from "next/link";

export default function NotFound() {
  return <main className="policy-page"><p className="eyebrow">Wrong turn</p><h1>This route is not on the journey.</h1><p><Link href="/">Return to the live walk</Link></p></main>;
}
