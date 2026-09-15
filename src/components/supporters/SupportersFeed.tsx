"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicSupporter, PublicSupporterPage } from "@/lib/supporters/data";

function contributionText(item: PublicSupporter) {
  if (item.coffeeCount === null) return `${item.displayName} supported the journey`;
  return `${item.displayName} bought ${item.coffeeCount} ${item.coffeeCount === 1 ? "coffee" : "coffees"}`;
}

async function getPage(before?: PublicSupporter): Promise<PublicSupporterPage> {
  const query = before
    ? `?beforeAt=${encodeURIComponent(before.occurredAt)}&beforeId=${before.id}`
    : "";
  const response = await fetch(`/api/supporters${query}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Supporters are temporarily unavailable.");
  return response.json() as Promise<PublicSupporterPage>;
}

export function SupportersFeed() {
  const [items, setItems] = useState<PublicSupporter[]>([]);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    void getPage().then((page) => {
      if (cancelled) return;
      setItems(page.items);
      setHasEarlier(page.hasEarlier);
      setState("ready");
      window.requestAnimationFrame(() => {
        if (list.current && firstLoad.current) list.current.scrollTop = list.current.scrollHeight;
        firstLoad.current = false;
      });
    }).catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, []);

  async function earlier() {
    const oldest = items[0];
    if (!oldest || loadingEarlier) return;
    setLoadingEarlier(true);
    const node = list.current;
    const previousHeight = node?.scrollHeight ?? 0;
    try {
      const page = await getPage(oldest);
      setItems((current) => [...page.items, ...current]);
      setHasEarlier(page.hasEarlier);
      window.requestAnimationFrame(() => {
        if (node) node.scrollTop += node.scrollHeight - previousHeight;
      });
    } catch {
      setState("error");
    } finally {
      setLoadingEarlier(false);
    }
  }

  async function latest() {
    setState("loading");
    try {
      const page = await getPage();
      setItems(page.items);
      setHasEarlier(page.hasEarlier);
      setState("ready");
      window.requestAnimationFrame(() => {
        if (list.current) list.current.scrollTop = list.current.scrollHeight;
      });
    } catch {
      setState("error");
    }
  }

  return <section className="supporters-feed" aria-busy={state === "loading"}>
    <div className="supporters-feed-intro">
      <p>Verified contributions that supporters permitted us to acknowledge here. Oldest first; nobody is ranked.</p>
      <button type="button" onClick={() => void latest()}>Latest</button>
    </div>
    <div className="supporters-scroll" ref={list} tabIndex={0} aria-label="Supporter acknowledgments">
      {hasEarlier ? <button className="supporters-earlier" type="button" disabled={loadingEarlier} onClick={() => void earlier()}>
        {loadingEarlier ? "Loading…" : "Earlier supporters"}
      </button> : null}
      {state === "loading" && items.length === 0 ? <p role="status" className="supporters-empty">Loading supporters…</p> : null}
      {state === "error" ? <p role="alert" className="supporters-empty">Supporters are temporarily unavailable. Try Latest again.</p> : null}
      {state === "ready" && items.length === 0 ? <p className="supporters-empty">No public supporters yet. The first verified acknowledgment will appear here.</p> : null}
      {items.length > 0 ? <ol className="supporters-list">
        {items.map((item) => <li key={item.id}>
          <div className="supporter-message">
            <p>{contributionText(item)}</p>
            <time dateTime={item.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.occurredAt))}</time>
            {item.xUrl || item.startupUrl ? <nav aria-label={`Verified links for ${item.displayName}`}>
              {item.xUrl ? <a href={item.xUrl} target="_blank" rel="noopener noreferrer">X <span className="sr-only">verified link</span> ↗</a> : null}
              {item.startupUrl ? <a href={item.startupUrl} target="_blank" rel="noopener noreferrer">Startup <span className="sr-only">verified link</span> ↗</a> : null}
            </nav> : null}
          </div>
        </li>)}
      </ol> : null}
    </div>
    <p className="supporters-privacy">Emails, payment details and private messages are never shown here.</p>
  </section>;
}
