import { travelerDisplayName } from "@/lib/traveler/name";

type Props = {
  collapsed: boolean;
  /** Null until the Day-1 vote names him; until then he is simply "he". */
  travelerName?: string | null;
  firstArrival?: {
    waitingLocalTime: string;
    waitedDuration: string;
    countdown: number;
  } | null;
  prelaunch?: boolean;
};

export function IntroHeadline({ collapsed, firstArrival, travelerName, prelaunch = false }: Props) {
  const named = typeof travelerName === "string" && travelerName.trim().length > 0;
  const subject = named ? travelerDisplayName(travelerName) : "He";
  return (
    <div
      className="premise-lockup"
      data-collapsed={collapsed}
      data-first-arrival={Boolean(firstArrival)}
    >
      <span className="eyebrow">ONE JOURNEY · {prelaunch ? "STARTS SOON" : "LIVE ON THE INTERNET"}</span>
      {firstArrival ? (
        <>
          <h1>
            {named ? `${subject} has` : "He's"} been waiting since{" "}
            {firstArrival.waitingLocalTime} ({firstArrival.waitedDuration}).
          </h1>
          <p className="waiting-detail">You&apos;re the first person here.</p>
          <p className="waiting-countdown">
            Keep watching · he starts walking in {firstArrival.countdown}…
          </p>
        </>
      ) : <h1>{subject} only walks while someone is watching.</h1>}
    </div>
  );
}
