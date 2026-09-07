import Link from "next/link";
export default function ContactPage() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return <main className="content-page"><Link className="back-link" href="/">← Return</Link><h1>Contact</h1>{email ? <p>For sponsor creative, refunds, privacy or accessibility support, email <a href={`mailto:${email}`}>{email}</a>.</p> : <p>Contact details are not configured in this private preview yet. They are a launch gate, not a fabricated address.</p>}</main>;
}
