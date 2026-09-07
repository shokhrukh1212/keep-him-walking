"use client";

import { useState, type FormEvent } from "react";

export function PreviewLogin() {
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/preview/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: data.get("secret") }) });
    const result = await response.json() as { authenticated?: boolean; path?: string; error?: string };
    if (response.ok && result.path) window.location.assign(result.path);
    else setError(result.error || "Preview access denied.");
  }
  return <form onSubmit={submit} className="preview-login"><label htmlFor="preview-secret">Preview access key</label><input id="preview-secret" name="secret" type="password" minLength={32} required autoComplete="current-password"/><button className="primary-button">Open staging preview</button>{error ? <p role="alert">{error}</p> : null}</form>;
}
