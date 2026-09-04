import { cookies } from "next/headers";
import Link from "next/link";
import { PreviewLogin } from "@/components/admin/PreviewLogin";
import { registeredCountryPacks } from "@/content/countries/registry";
import { validatePreviewSession } from "@/lib/admin/preview-auth";

export const dynamic = "force-dynamic";

export default async function PreviewIndex() {
  const authenticated = validatePreviewSession((await cookies()).get("khw_preview")?.value);
  return <main className="policy-page"><p className="eyebrow">Protected staging</p><h1>Country-pack preview</h1>{authenticated ? <ul>{registeredCountryPacks().filter((pack) => pack.schemaVersion === 3).map((pack) => <li key={pack.assetVersion}><Link href={`/preview/${pack.assetVersion}`}>{pack.cityName}, {pack.countryName} · {pack.assetVersion}</Link></li>)}</ul> : <PreviewLogin />}</main>;
}
