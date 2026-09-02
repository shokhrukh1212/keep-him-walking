import type {
  CountryPack,
  DialogueLine,
  TravelerState,
} from "@/lib/content/schema";
import type { RouteRuntime } from "@/lib/world/types";

export type ConnectionStatus = "live" | "reconnecting" | "offline";

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
  opensAt: string;
  closesAt: string;
  status: "open" | "closed";
  totalBallots: number;
  selectedOptionId: string | null;
  options: Array<{
    id: string;
    label: string;
    displayOrder: number;
    votes?: number;
  }>;
};

export type BootstrapSnapshot = {
  serverNow: string;
  realServerNow: string;
  mode: "live" | "offline_preview";
  journeyState: "prelaunch" | "live" | "intermission" | "completed";
  refresh: { nextAt: string | null; afterMs: number; reason: "country_rollover" | "event" | "none" };
  countryDay: CountryDayView;
  activeEvent: ScheduledEventView | null;
  nextEvent: ScheduledEventView | null;
  vote: VoteView | null;
  presence: {
    activeViewers: number | null;
    status: ConnectionStatus;
    ttlSeconds: number;
  };
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
        ctaLabel: string | null;
        clickUrl: string | null;
      };
  postcard: {
    eligible: boolean;
    unlockSeconds: number;
    contributedSeconds: number;
    url: string | null;
  };
  assets: CountryPack;
};

export type HeartbeatResponse = {
  serverNow: string;
  realServerNow: string;
  activeViewers: number;
  walking: boolean;
  globalSteps: number;
  visitorActiveSeconds: number;
  ttlSeconds: number;
  nextHeartbeatInMs: number;
  globalActiveSeconds: number;
  routeAuthoritativeAt: string;
};
