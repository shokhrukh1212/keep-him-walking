export const en = {
  premise: "He only walks while someone is watching.",
  live: { walking: "He’s walking because you’re here", waiting: "He’s waiting for a watcher", reconnecting: "Live count reconnecting" },
  controls: { vote: "Daily vote", share: "Share", soundOn: "Sound on", soundOff: "Sound off", fullMotion: "Full motion", reducedMotion: "Motion reduced" },
  retention: { tomorrow: "Tomorrow", calendar: "Add to calendar" },
} as const;

export type Dictionary = typeof en;
