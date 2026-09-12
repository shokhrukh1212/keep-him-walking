import type {
  CountryPack,
  DialogueLine,
  TravelerState,
} from "@/lib/content/schema";
import type { RouteRuntime, WalkingClock } from "@/lib/world/types";
import type { ActivityKind, ActivitySource } from "@/lib/world/activities";
import type { JourneyWeather } from "@/lib/weather/open-meteo";

export type ConnectionStatus = "live" | "reconnecting" | "offline" | "scheduled";

export type CountryDayView = {
  id: string;
  dayNumber: number;
  totalDays: number;
  countryCode: string;
  countryName: string;
  cityName: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  storySummary: string | null;
  scenePackId: string;
};

export type ScheduledEventView = {
  id: string;
  type: string;
  startsAt: string;
  durationSeconds: number;
  status: string;
  travelerState?: TravelerState;
  locationLabel?: string;
  lines?: DialogueLine[];
};

export type VoteView = {
  id: string;
  question: string;
  /** 'name' is the Day-1 ballot that names him; every other day is a destination. */
  kind: "destination" | "name";
  opensAt: string;
  closesAt: string;
  status: "open" | "closed";
  totalBallots: number;
  selectedOptionId: string | null;
  /** The published winner, set only once the ballot has closed. */
  resultOptionId: string | null;
  options: Array<{
    id: string;
    label: string;
    displayOrder: number;
    /** Set on destination ballots so the chip can show a flag and a blurb. */
    packId: string | null;
    countryCode: string | null;
    blurb: string | null;
    votes?: number;
  }>;
};

export type LiveCountryView = {
  code: string;
  watchers: number;
};

export type CountryWatchView = {
  code: string;
  watchSeconds: number;
};

/** Live 30-second bucket counts for the three reaction enums. */
export type ReactionCounts = {
  wave: number;
  water: number;
  photo: number;
};

/**
 * One server-owned stop window: a crowd reaction, a story beat or one of his own
 * scheduled activities. Distance and the road pause inside it for every viewer.
 */
export type ScheduledActionView = {
  kind: ActivityKind;
  atActiveSecond: number;
  /** Server-owned action boundary and planted route position. */
  endsAtActiveSecond?: number;
  frozenDistanceMetres?: number | null;
  /** Absent means a crowd reaction, as every row was before migration 0036. */
  source?: ActivitySource;
  /** The reviewed conversation script, when the stop is a conversation. */
  variant?: string;
  /** Stable per-day identity of a scheduled occurrence. */
  occurrenceKey?: string;
  /** A not-yet-started activity a crowd reaction displaced. It never plays. */
  cancelled?: boolean;
};

export type DayPhotoView = {
  atActiveSecond: number;
  url: string;
};

export type ReactionsView = {
  counts: ReactionCounts;
  /** Recent and upcoming stops, fed straight into travelerMotionAt. */
  scheduled: ScheduledActionView[];
  nextScheduledAction: ScheduledActionView | null;
  /** The walking-clock anchor these rows were read at. */
  walkingClock?: WalkingClock;
};

export type BootstrapSnapshot = {
  serverNow: string;
  realServerNow: string;
  /** Story-clock multiplier. It is greater than one only in an isolated rehearsal. */
  storyScale?: number;
  mode: "live" | "prelaunch" | "offline_preview";
  /** Private response fact derived from the HttpOnly identity cookie. */
  firstVisit?: boolean;
  journeyState: "prelaunch" | "live" | "intermission" | "completed";
  refresh: { nextAt: string | null; afterMs: number; reason: "country_rollover" | "event" | "launch" | "none" };
  countryDay: CountryDayView;
  /** Season-level facts. travelerName is null until the Day-1 vote names him. */
  journey: { travelerName: string | null; rolloverUtcHour: number };
  activeEvent: ScheduledEventView | null;
  nextEvent: ScheduledEventView | null;
  vote: VoteView | null;
  /** The nearest approved future Ticket, confirmed by Postgres. */
  ticket?: {
    dayNumber: number;
    countryCode: string;
    countryName: string;
    cityName: string;
    scenePackId: string;
  } | null;
  /** The next committed country-day. Never inferred from the content registry. */
  tomorrow?: {
    dayNumber: number;
    countryCode: string;
    countryName: string;
    cityName: string;
    scenePackId: string;
    startsAt: string;
    arrivalMode: "walk" | "train" | "flight";
  } | null;
  presence: {
    activeViewers: number | null;
    status: ConnectionStatus;
    ttlSeconds: number;
    waitingSince: string | null;
  };
  /** Server-confirmed audience by country. Live counts expire with the leases. */
  countries: {
    live: LiveCountryView[];
    todayTop: CountryWatchView[];
  };
  reactions: ReactionsView;
  /** The day's last six crowd photographs, newest first. */
  dayPhotos: DayPhotoView[];
  /** The city's real weather, or null when no reading has been confirmed. */
  weather: JourneyWeather | null;
  steps: {
    global: number;
    updatedAt: string;
    stale: boolean;
  };
  route: RouteRuntime;
  sponsor:
    | { status: "unsponsored" }
    | {
        status: "sponsored";
        publicId: string;
        name: string;
        disclosure: string;
        patchUrl: string | null;
        /** Premium buys the bottle label and the cafe sign; standard buys neither. */
        tier: "standard" | "premium";
        bottleUrl: string | null;
        ctaLabel: string | null;
        clickUrl: string | null;
      };
  postcard: {
    eligible: boolean;
    unlockSeconds: number;
    contributedSeconds: number;
    url: string | null;
  };
  passport: {
    /** Consecutive published days this visitor collected, confirmed by the server. */
    streak: number;
    collectedToday: boolean;
    collectSeconds: number;
  };
  milestones: {
    /** When a hundred people first watched this day at once. Never guessed locally. */
    hundredWatchersAt: string | null;
  };
  assets: CountryPack;
};

export type HeartbeatResponse = {
  countryDayId?: string;
  serverNow: string;
  realServerNow: string;
  /** Story-clock multiplier. It is greater than one only in an isolated rehearsal. */
  storyScale?: number;
  activeViewers: number;
  walking: boolean;
  globalSteps: number;
  visitorActiveSeconds: number;
  ttlSeconds: number;
  nextHeartbeatInMs: number;
  globalActiveSeconds: number;
  globalDistanceMetres: number;
  paceRate: number;
  routeAuthoritativeAt: string;
  waitingSince: string | null;
  wokeHim: boolean;
  /** Recipient-only token, present only on the heartbeat that awards the wake moment. */
  firstWatcherShareToken?: string | null;
  /** When a hundred people first watched this day at once, or null if never. */
  hundredWatchersAt?: string | null;
  /** The edge-derived country the server credited this heartbeat to. */
  countryCode: string;
  reactions: ReactionsView;
  weather: JourneyWeather | null;
  /** True when this heartbeat scheduled the next stop; the client hints other viewers to re-read. */
  activityScheduled?: boolean;
};
