"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="app-loading" role="alert">
      <span className="eyebrow">THE JOURNEY PAUSED</span>
      <h1>We could not prepare the scene.</h1>
      <button className="primary-button" onClick={reset} type="button">
        Try again
      </button>
    </main>
  );
}
