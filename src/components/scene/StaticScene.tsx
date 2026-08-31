"use client";

import { useEffect, useRef } from "react";

type Props = {
  src: string;
  onReady: () => void;
};

export function StaticScene({ src, onReady }: Props) {
  const reported = useRef(false);
  const report = () => {
    if (reported.current) return;
    reported.current = true;
    onReady();
  };

  useEffect(() => {
    const timeout = window.setTimeout(report, 2_500);
    return () => window.clearTimeout(timeout);
  });

  return (
    <div className="static-scene" aria-hidden="true">
      {/* A CSS gradient remains behind the asset if image decoding fails. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onLoad={report} onError={report} draggable={false} />
    </div>
  );
}
