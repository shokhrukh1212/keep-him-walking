"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AdminSignIn() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const secret = String(new FormData(form).get("secret") ?? "");
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (response.ok) {
        form.reset();
        router.replace("/admin");
        return;
      }
      setMessage(response.status === 429
        ? "Too many attempts. Please try again after the access limit resets."
        : "Sign-in failed. Check your admin access secret and server configuration.");
    } catch {
      setMessage("The server could not be reached. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return <form className="admin-sign-in" onSubmit={signIn}>
    <label htmlFor="admin-secret">Admin access secret</label>
    <input id="admin-secret" name="secret" type="password" required maxLength={512} autoComplete="current-password" />
    <button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
    {message ? <p role="alert">{message}</p> : null}
  </form>;
}
