import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/admin/CopyButton";
import { ADMIN_SESSION_COOKIE, validateAdminSession } from "@/lib/admin/admin-auth";
import { loadPostKit } from "@/lib/postkit/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ n: string }> };

export default async function PostKitPage({ params }: Props) {
  if (!validateAdminSession((await cookies()).get(ADMIN_SESSION_COOKIE)?.value)) notFound();
  const dayNumber = Number((await params).n);
  const kit = await loadPostKit(dayNumber);
  if (!kit) notFound();
  const entries = [
    ["Recap", kit.recapText],
    ["Home team", kit.homeTeamText],
    ["Vote", kit.voteText],
    ["Price", kit.priceText],
  ] as const;
  return (
    <main className="content-page admin-page">
      <span className="eyebrow">PRIVATE OPERATIONS</span>
      <h1>Day {dayNumber} post kit</h1>
      <div className="postkit-list">
        {entries.map(([label, value]) => (
          <section key={label}>
            <h2>{label}</h2>
            <p>{value}</p>
            <CopyButton value={value} />
          </section>
        ))}
        <section>
          <h2>Images</h2>
          <ul>{kit.imageUrls.map((url) => <li key={url}><a href={url}>{url}</a> <CopyButton value={url} /></li>)}</ul>
        </section>
      </div>
    </main>
  );
}
