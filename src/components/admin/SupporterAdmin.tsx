"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { parseCsv, type CsvDocument, type SupporterImportMapping } from "@/lib/supporters/import";
import type { AdminSupporterContribution } from "@/lib/supporters/data";

type Editable = {
  id: number | null;
  source: "manual" | "buy_me_a_coffee";
  externalTransactionId: string;
  occurredAt: string;
  displayName: string;
  isAnonymous: boolean;
  coffeeCount: string;
  xUrl: string;
  xVerified: boolean;
  startupUrl: string;
  startupVerified: boolean;
  privateEmail: string;
  privatePaymentId: string;
  privateMessage: string;
  paymentVerified: boolean;
  acknowledgmentPermission: boolean;
};

const EMPTY: Editable = {
  id: null,
  source: "manual",
  externalTransactionId: "",
  occurredAt: new Date().toISOString().slice(0, 16),
  displayName: "",
  isAnonymous: false,
  coffeeCount: "",
  xUrl: "",
  xVerified: false,
  startupUrl: "",
  startupVerified: false,
  privateEmail: "",
  privatePaymentId: "",
  privateMessage: "",
  paymentVerified: false,
  acknowledgmentPermission: false,
};

const EMPTY_MAPPING: SupporterImportMapping = {
  transactionId: "",
  occurredAt: "",
  displayName: null,
  coffeeCount: null,
  anonymous: null,
  email: null,
  paymentId: null,
  privateMessage: null,
  xUrl: null,
  startupUrl: null,
};

function editable(row: AdminSupporterContribution): Editable {
  return {
    id: row.id,
    source: row.source,
    externalTransactionId: row.external_transaction_id ?? "",
    occurredAt: new Date(row.occurred_at).toISOString().slice(0, 16),
    displayName: row.display_name ?? "",
    isAnonymous: row.is_anonymous,
    coffeeCount: row.coffee_count?.toString() ?? "",
    xUrl: row.x_url ?? "",
    xVerified: row.x_verified,
    startupUrl: row.startup_url ?? "",
    startupVerified: row.startup_verified,
    privateEmail: row.private_email ?? "",
    privatePaymentId: row.private_payment_id ?? "",
    privateMessage: row.private_message ?? "",
    paymentVerified: row.payment_verified,
    acknowledgmentPermission: row.acknowledgment_permission,
  };
}

async function responseMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null) as { error?: string | { message?: string } } | null;
  return typeof body?.error === "string" ? body.error : body?.error?.message ?? fallback;
}

function ContributionForm({ initial, onSaved }: { initial: Editable; onSaved: () => void }) {
  const [value, setValue] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("saving");
    setError("");
    const response = await fetch("/api/admin/supporters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...value,
        externalTransactionId: value.externalTransactionId || null,
        occurredAt: new Date(value.occurredAt).toISOString(),
        displayName: value.displayName || null,
        coffeeCount: value.coffeeCount ? Number(value.coffeeCount) : null,
        xUrl: value.xUrl || null,
        startupUrl: value.startupUrl || null,
        privateEmail: value.privateEmail || null,
        privatePaymentId: value.privatePaymentId || null,
        privateMessage: value.privateMessage || null,
      }),
    });
    if (!response.ok) {
      setError(await responseMessage(response, "The record was not saved."));
      setState("idle");
      return;
    }
    setState("saved");
    onSaved();
  }

  const update = <K extends keyof Editable>(key: K, next: Editable[K]) => setValue((current) => ({ ...current, [key]: next }));
  return <form className="supporter-admin-form" onSubmit={submit}>
    <div className="supporter-admin-grid">
      <label>Source<select value={value.source} onChange={(event) => update("source", event.target.value as Editable["source"])}>
        <option value="manual">Manual</option><option value="buy_me_a_coffee">Buy Me a Coffee</option>
      </select></label>
      <label>Contribution date<input type="datetime-local" required value={value.occurredAt} onChange={(event) => update("occurredAt", event.target.value)} /></label>
      <label>Display name<input maxLength={100} value={value.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
      <label>Actual coffee count, if supplied<input type="number" min={1} max={10000} value={value.coffeeCount} onChange={(event) => update("coffeeCount", event.target.value)} /></label>
      <label>Provider transaction ID<input maxLength={200} value={value.externalTransactionId} onChange={(event) => update("externalTransactionId", event.target.value)} /></label>
      <label>Private payment ID<input maxLength={200} value={value.privatePaymentId} onChange={(event) => update("privatePaymentId", event.target.value)} /></label>
      <label>Private email<input type="email" maxLength={254} value={value.privateEmail} onChange={(event) => update("privateEmail", event.target.value)} /></label>
      <label>X profile URL<input type="url" placeholder="https://x.com/name" value={value.xUrl} onChange={(event) => update("xUrl", event.target.value)} /></label>
      <label>Startup URL<input type="url" placeholder="https://startup.example" value={value.startupUrl} onChange={(event) => update("startupUrl", event.target.value)} /></label>
    </div>
    <label>Private supporter message<textarea maxLength={5000} rows={3} value={value.privateMessage} onChange={(event) => update("privateMessage", event.target.value)} /></label>
    <fieldset className="supporter-admin-checks">
      <legend>Publication checks</legend>
      <label><input type="checkbox" checked={value.isAnonymous} onChange={(event) => update("isAnonymous", event.target.checked)} /> Acknowledge anonymously</label>
      <label><input type="checkbox" checked={value.paymentVerified} onChange={(event) => update("paymentVerified", event.target.checked)} /> Contribution/payment verified</label>
      <label><input type="checkbox" checked={value.acknowledgmentPermission} onChange={(event) => update("acknowledgmentPermission", event.target.checked)} /> Permission to acknowledge on Keep Him Walking confirmed</label>
      <label><input type="checkbox" checked={value.xVerified} onChange={(event) => update("xVerified", event.target.checked)} /> X link verified</label>
      <label><input type="checkbox" checked={value.startupVerified} onChange={(event) => update("startupVerified", event.target.checked)} /> Startup link verified</label>
    </fieldset>
    {initial.id && initial !== value ? <p className="admin-note">Saving a published record returns it to draft for approval.</p> : null}
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    <button type="submit" disabled={state === "saving"}>{state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save draft"}</button>
  </form>;
}

function ImportExport({ onImported }: { onImported: () => void }) {
  const [csv, setCsv] = useState("");
  const [document, setDocument] = useState<CsvDocument | null>(null);
  const [mapping, setMapping] = useState<SupporterImportMapping>(EMPTY_MAPPING);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");

  async function choose(file: File | undefined) {
    setError("");
    setResult("");
    setDocument(null);
    setMapping(EMPTY_MAPPING);
    if (!file) return;
    if (file.size > 2_000_000) { setError("Use a CSV export smaller than 2 MB."); return; }
    const text = await file.text();
    try {
      const parsed = parseCsv(text);
      setCsv(text);
      setDocument(parsed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The export could not be read.");
    }
  }

  async function runImport(event: FormEvent) {
    event.preventDefault();
    if (!document || !mapping.transactionId || !mapping.occurredAt) return;
    setError("");
    setResult("Importing…");
    const response = await fetch("/api/admin/supporters/import", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, mapping }),
    });
    if (!response.ok) {
      setError(await responseMessage(response, "The export was not imported."));
      setResult("");
      return;
    }
    const counts = await response.json() as { inserted: number; duplicates: number };
    setResult(`${counts.inserted} imported as private drafts · ${counts.duplicates} duplicates skipped.`);
    onImported();
  }

  const select = (key: keyof SupporterImportMapping, label: string, required = false) => <label>{label}
    <select required={required} value={mapping[key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [key]: event.target.value || null }))}>
      <option value="">Not imported</option>
      {document?.headers.map((header) => <option key={header} value={header}>{header}</option>)}
    </select>
  </label>;

  return <section className="supporter-import">
    <h2>Import a Buy Me a Coffee export</h2>
    <p>Choose the real CSV, inspect its columns below, then map them explicitly. No provider column names or coffee price are assumed. Imported rows stay private drafts.</p>
    <input type="file" accept=".csv,text/csv" aria-label="Buy Me a Coffee CSV export" onChange={(event) => void choose(event.target.files?.[0])} />
    {error ? <p role="alert" className="form-error">{error}</p> : null}
    {document ? <form onSubmit={runImport}>
      <p><strong>{document.rows.length}</strong> transactions · columns: {document.headers.join(", ")}</p>
      <div className="supporter-import-preview" tabIndex={0} aria-label="First export rows">
        <table><thead><tr>{document.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{document.rows.slice(0, 3).map((row, index) => <tr key={index}>{document.headers.map((header) => <td key={header}>{row[header]}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="supporter-admin-grid">
        {select("transactionId", "Unique transaction ID", true)}
        {select("occurredAt", "Contribution date", true)}
        {select("displayName", "Display name")}
        {select("coffeeCount", "Actual coffee count")}
        {select("anonymous", "Anonymous flag")}
        {select("email", "Private email")}
        {select("paymentId", "Private payment ID")}
        {select("privateMessage", "Private message")}
        {select("xUrl", "X profile")}
        {select("startupUrl", "Startup link")}
      </div>
      <button type="submit">Import private drafts</button>
    </form> : null}
    {result ? <p role="status">{result}</p> : null}
  </section>;
}

export function SupporterAdmin({ initialRows }: { initialRows: AdminSupporterContribution[] }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const refresh = () => router.refresh();

  async function action(id: number, operation: "publish" | "unpublish" | "remove") {
    setError("");
    const response = await fetch(`/api/admin/supporters/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: operation }),
    });
    if (!response.ok) { setError(await responseMessage(response, "The action was not saved.")); return; }
    refresh();
  }

  return <div className="supporter-admin">
    <ImportExport onImported={refresh} />
    <section>
      <h2>Manual contribution</h2>
      <p>Use this when an export is unavailable. Leave coffee count blank unless the exact count is known.</p>
      <ContributionForm initial={{ ...EMPTY }} onSaved={refresh} />
    </section>
    <section>
      <h2>Contribution ledger</h2>
      <p>Oldest first. Only published rows appear publicly; private fields below never do.</p>
      {error ? <p role="alert" className="form-error">{error}</p> : null}
      {initialRows.length === 0 ? <p>No supporter contributions have been recorded.</p> : <ol className="supporter-admin-list">
        {initialRows.map((row) => <li key={row.id} data-status={row.status}>
          <div className="supporter-admin-summary"><strong>{row.is_anonymous ? "Anonymous supporter" : row.display_name ?? "Name missing"}</strong><span>{row.status} · {new Date(row.occurred_at).toLocaleString()}</span></div>
          <details><summary>Edit and review private record</summary><ContributionForm initial={editable(row)} onSaved={refresh} /></details>
          <div className="correction-actions">
            {row.status !== "published" && row.status !== "removed" ? <button type="button" onClick={() => void action(row.id, "publish")}>Publish acknowledgment</button> : null}
            {row.status === "published" ? <button type="button" onClick={() => void action(row.id, "unpublish")}>Unpublish</button> : null}
            {row.status !== "removed" ? <button type="button" onClick={() => void action(row.id, "remove")}>Remove</button> : null}
          </div>
        </li>)}
      </ol>}
    </section>
  </div>;
}
