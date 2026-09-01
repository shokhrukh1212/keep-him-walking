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
  mode: "live" | "offline_preview";
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
  sponsor: { status: "unsponsored" };
  assets: CountryPack;
};

export type HeartbeatResponse = {
  serverNow: string;
  activeViewers: number;
  walking: boolean;
  globalSteps: number;
  visitorActiveSeconds: number;
  ttlSeconds: number;
  nextHeartbeatInMs: number;
  globalActiveSeconds: number;
  routeAuthoritativeAt: string;
};
