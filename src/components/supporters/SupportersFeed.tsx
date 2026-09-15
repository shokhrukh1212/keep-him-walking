"use client";

import { useRef, useState } from "react";
import { SUPPORTER_ACKNOWLEDGMENTS, supporterPage, type SupporterAcknowledgment } from "@/content/supporters";

type Props = { acknowledgments?: readonly SupporterAcknowledgment[] };

function contributionText(item: SupporterAcknowledgment) {
  if (item.coffeeCount === null) return `${item.displayName} supported the journey`;
  return `${item.displayName} bought ${item.coffeeCount} ${item.coffeeCount === 1 ? "coffee" : "coffees"}`;
}

export function SupportersFeed({ acknowledgments = SUPPORTER_ACKNOWLEDGMENTS }: Props) {
  const [page, setPage] = useState(() => supporterPage(acknowledgments, null));
  const list = useRef<HTMLDivElement>(null);

  function earlier() {
    const oldest = page.items[0];
    if (!oldest) return;
    const node = list.current;
    const previousHeight = node?.scrollHeight ?? 0;
    setPage(supporterPage(acknowledgments, oldest.id));
    window.requestAnimationFrame(() => {
      if (node) node.scrollTop += node.scrollHeight - previousHeight;
    });
  }

  function latest() {
    setPage(supporterPage(acknowledgments, null));
    window.requestAnimationFrame(() => {
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    });
  }

  return <section className="supporters-feed">
    <div className="supporters-feed-intro">
      <p>Owner-approved acknowledgments. Oldest first; nobody is ranked.</p>
      <button type="button" onClick={latest}>Latest</button>
    </div>
    <div className="supporters-scroll" ref={list} tabIndex={0} aria-label="Supporter acknowledgments">
      {page.hasEarlier ? <button className="supporters-earlier" type="button" onClick={earlier}>Earlier supporters</button> : null}
      {page.items.length === 0 ? <p className="supporters-empty">No public supporters yet. The first owner-approved acknowledgment will appear here.</p> : <ol className="supporters-list">
        {page.items.map((item) => <li key={item.id}>
          <div className="supporter-message">
            <p>{contributionText(item)}</p>
            <time dateTime={item.occurredAt}>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.occurredAt))}</time>
            {item.xUrl || item.startupUrl ? <nav aria-label={`Verified links for ${item.displayName}`}>
              {item.xUrl ? <a href={item.xUrl} target="_blank" rel="noopener noreferrer">X <span className="sr-only">verified link</span> ↗</a> : null}
              {item.startupUrl ? <a href={item.startupUrl} target="_blank" rel="noopener noreferrer">Startup <span className="sr-only">verified link</span> ↗</a> : null}
            </nav> : null}
          </div>
        </li>)}
      </ol>}
    </div>
    <p className="supporters-privacy">Emails, payment details and private messages are never shown here.</p>
  </section>;
}
