type Props = {
  collapsed: boolean;
  firstArrival?: {
    waitingLocalTime: string;
    waitedDuration: string;
    countdown: number;
  } | null;
};

export function IntroHeadline({ collapsed, firstArrival }: Props) {
  return (
    <div
      className="premise-lockup"
      data-collapsed={collapsed}
      data-first-arrival={Boolean(firstArrival)}
    >
      <span className="eyebrow">ONE JOURNEY · LIVE ON THE INTERNET</span>
      {firstArrival ? (
        <>
          <h1>
            He&apos;s been waiting since {firstArrival.waitingLocalTime}{" "}
            ({firstArrival.waitedDuration}).
          </h1>
          <p className="waiting-detail">You&apos;re the first person here.</p>
          <p className="waiting-countdown">
            Keep watching · he starts walking in {firstArrival.countdown}…
          </p>
        </>
      ) : <h1>He only walks while someone is watching.</h1>}
    </div>
  );
}
