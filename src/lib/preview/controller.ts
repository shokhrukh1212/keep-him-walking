import type { PrelaunchMonologueLine } from "@/content/prelaunch/monologues";
import type { CharacterClip } from "@/lib/characters/manifest";
import {
  INITIAL_MONOLOGUE_SCHEDULE,
  advanceMonologues,
  monologueCaptionAt,
  monologueTimeline,
  nextMonologueBoundary,
  slotNeedsSponsor,
  withModelReady,
  type MonologueSchedule,
} from "./monologue";

/** What the character frame loop reads from the preview. Sampling never changes anything. */
export type PreviewPose = {
  /** Visible preview seconds; the idle take keeps breathing on this clock. */
  idleSeconds: number;
  /** True exactly while the caption shows, except under reduced motion, where he stays idle. */
  speaking: boolean;
  /** Seconds into the current speech. */
  speechSeconds: number;
  clip?: CharacterClip;
};

export type PreviewPoseSource = { sample(nowMs: number): PreviewPose };

export type PreviewCaptionSnapshot = {
  speaking: boolean;
  lineId: string | null;
  /** The whole line, announced once when he starts it. */
  lineText: string | null;
  cueIndex: number;
  cueText: string | null;
  /** How many monologues have started; every new one changes it. */
  sequence: number;
};

const IDLE_CAPTION: PreviewCaptionSnapshot = {
  speaking: false, lineId: null, lineText: null, cueIndex: 0, cueText: null, sequence: 0,
};

type VisibilityTarget = Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;

export type PreviewControllerOptions = {
  lines: readonly PrelaunchMonologueLine[];
  cityName?: string;
  seasonNumber?: number;
  /** Asked once ahead of each sponsor line; anything but true keeps the neutral line. */
  loadSponsorOpen?: (seasonNumber: number) => Promise<boolean>;
  /** Monotonic milliseconds, the same clock the frame loop samples with. */
  now?: () => number;
  visibility?: () => VisibilityTarget | null;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/**
 * The one owner of the prelaunch monologues: which line, how long, when he speaks and when
 * its caption shows. Its clock counts only visible page time, so a hidden tab pauses both the
 * schedule and a speech and resumes them without catching up. It keeps at most one timer, set
 * for the next moment something on screen changes. It is local to this visitor and never
 * touches shared journey state.
 */
export class PreviewMonologueController implements PreviewPoseSource {
  private readonly lines: readonly PrelaunchMonologueLine[];
  private cityName: string;
  private seasonNumber: number;
  private lifecycleState: "waiting" | "scheduled" = "waiting";
  private filledRegular: number | null = null;
  private readonly loadSponsorOpen?: (seasonNumber: number) => Promise<boolean>;
  private readonly now: () => number;
  /** Server-synchronized wall-clock milliseconds, so a dated line drops out after its moment. */
  private wallClockMs: number | null = null;
  private readonly visibility: () => VisibilityTarget | null;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private schedule: MonologueSchedule = INITIAL_MONOLOGUE_SCHEDULE;
  private snapshot: PreviewCaptionSnapshot = IDLE_CAPTION;
  private readonly listeners = new Set<() => void>();
  private running = false;
  private target: VisibilityTarget | null = null;
  private visibleMs = 0;
  private resumedAt: number | null = null;
  private timer: unknown = null;
  private modelReady = false;
  private deferred = false;
  private reducedMotion = false;
  private sponsorOpen: boolean | null = null;
  private sponsorAskedForSlot: number | null = null;
  private priorityBeats: Array<{ id: string; text: string; clip: CharacterClip }> = [];

  constructor(options: PreviewControllerOptions) {
    this.lines = options.lines;
    this.cityName = options.cityName ?? "";
    this.seasonNumber = options.seasonNumber ?? 1;
    this.loadSponsorOpen = options.loadSponsorOpen;
    this.now = options.now ?? (() => performance.now());
    this.visibility = options.visibility ?? (() => (typeof document === "undefined" ? null : document));
    this.setTimer = options.setTimer ?? ((callback, delayMs) => window.setTimeout(callback, delayMs));
    this.clearTimer = options.clearTimer ?? ((handle) => window.clearTimeout(handle as number));
  }

  configure(settings: {
    cityName: string;
    seasonNumber: number;
    lifecycleState?: "waiting" | "scheduled";
    filledRegular?: number | null;
  }) {
    this.cityName = settings.cityName;
    this.seasonNumber = settings.seasonNumber;
    this.lifecycleState = settings.lifecycleState ?? "waiting";
    this.filledRegular = settings.filledRegular ?? null;
  }

  /** The page's synchronized wall clock; read only when the next line is chosen. */
  setWallClock(nowMs: number) {
    this.wallClockMs = Number.isFinite(nowMs) ? nowMs : null;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.target = this.visibility();
    this.target?.addEventListener("visibilitychange", this.onVisibility);
    if (this.visible()) this.resumedAt = this.now();
    this.tick();
  }

  /** Leaves the preview: a speech ends at once and nothing stays on screen. */
  stop() {
    if (!this.running) return;
    this.pauseClock();
    this.running = false;
    this.cancelTimer();
    this.target?.removeEventListener("visibilitychange", this.onVisibility);
    this.target = null;
    this.schedule = { ...this.schedule, speaking: null };
    this.publish(this.seconds());
  }

  /** The traveler (or, without one, the page) is ready; the first line follows shortly. */
  setModelReady() {
    if (this.modelReady) return;
    this.modelReady = true;
    this.schedule = withModelReady(this.schedule, this.seconds());
    this.tick();
  }

  /** While true, no new monologue starts; one already under way finishes. */
  setDeferred(deferred: boolean) {
    if (deferred === this.deferred) return;
    this.deferred = deferred;
    this.tick();
  }

  setReducedMotion(reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
  }

  /** Real visitor/state events go before ambient dialogue without cutting off a line. */
  enqueuePriorityBeat(beat: { id: string; text: string; clip: CharacterClip }) {
    if (this.priorityBeats.some((queued) => queued.id === beat.id)
      || this.schedule.speaking?.id === beat.id) return;
    this.priorityBeats.push(beat);
    this.tick();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  getServerSnapshot = () => IDLE_CAPTION;

  sample(nowMs: number): PreviewPose {
    const at = this.seconds(nowMs);
    // The pose follows the same flag the caption renders, so the two can never disagree.
    const speech = this.snapshot.speaking ? this.schedule.speaking : null;
    return {
      idleSeconds: at,
      speaking: Boolean(speech) && !this.reducedMotion,
      speechSeconds: speech ? Math.max(0, at - speech.startedAt) : 0,
      clip: speech ? speech.clip ?? "talk" : "idle",
    };
  }

  private seconds(nowMs = this.now()) {
    const running = this.resumedAt === null ? 0 : Math.max(0, nowMs - this.resumedAt);
    return (this.visibleMs + running) / 1_000;
  }

  private visible() {
    return (this.target?.visibilityState ?? "visible") === "visible";
  }

  private pauseClock() {
    if (this.resumedAt === null) return;
    this.visibleMs += Math.max(0, this.now() - this.resumedAt);
    this.resumedAt = null;
  }

  private onVisibility = () => {
    if (!this.running) return;
    if (this.visible()) {
      if (this.resumedAt === null) this.resumedAt = this.now();
      this.tick();
    } else {
      this.pauseClock();
      this.cancelTimer();
    }
  };

  private tick = () => {
    this.cancelTimer();
    if (!this.running) return;
    const at = this.seconds();
    this.schedule = advanceMonologues(this.schedule, {
      at,
      deferred: this.deferred,
      lines: this.lines,
      cityName: this.cityName,
      sponsorOpen: this.sponsorOpen,
      nowMs: this.wallClockMs,
      lifecycleState: this.lifecycleState,
      filledRegular: this.filledRegular,
    });
    if (!this.deferred && !this.schedule.speaking && this.priorityBeats.length > 0) {
      const beat = this.priorityBeats.shift()!;
      this.schedule = {
        ...this.schedule,
        speaking: {
          slot: -1, id: beat.id, text: beat.text, sponsor: false, clip: beat.clip,
          startedAt: at, timeline: monologueTimeline(beat.text),
        },
        nextStartAt: at + 15,
        lastText: beat.text,
        started: this.schedule.started + 1,
      };
    }
    this.askAboutSponsorship();
    this.publish(at);
    this.arm(at);
  };

  private arm(at: number) {
    this.cancelTimer();
    // A hidden page keeps no timer; becoming visible wakes it.
    if (!this.running || this.resumedAt === null) return;
    const wake = nextMonologueBoundary(this.schedule, at);
    if (wake === null) return;
    this.timer = this.setTimer(this.tick, Math.ceil((wake - at) * 1_000) + 1);
  }

  private cancelTimer() {
    if (this.timer === null) return;
    this.clearTimer(this.timer);
    this.timer = null;
  }

  /** Reads availability once, a whole interval before the sponsor line is due. */
  private askAboutSponsorship() {
    const slot = this.schedule.nextSlot;
    if (!this.loadSponsorOpen || this.schedule.sponsorSpoken || this.sponsorAskedForSlot === slot
      || !slotNeedsSponsor(this.lines, slot)) return;
    this.sponsorAskedForSlot = slot;
    this.sponsorOpen = null;
    this.loadSponsorOpen(this.seasonNumber).then(
      (open) => { if (this.sponsorAskedForSlot === slot) this.sponsorOpen = open === true; },
      () => { if (this.sponsorAskedForSlot === slot) this.sponsorOpen = false; },
    );
  }

  private publish(at: number) {
    const caption = monologueCaptionAt(this.schedule, at);
    const sequence = this.schedule.started;
    const current = this.snapshot;
    const next: PreviewCaptionSnapshot = caption
      ? { speaking: true, lineId: caption.id, lineText: caption.text, cueIndex: caption.cueIndex, cueText: caption.cueText, sequence }
      : { ...IDLE_CAPTION, sequence };
    if (next.speaking === current.speaking && next.lineId === current.lineId
      && next.cueIndex === current.cueIndex && next.sequence === current.sequence) return;
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}
