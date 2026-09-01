type Props = { collapsed: boolean };

export function IntroHeadline({ collapsed }: Props) {
  return (
    <div className="premise-lockup" data-collapsed={collapsed}>
      <span className="eyebrow">ONE JOURNEY · LIVE ON THE INTERNET</span>
      <h1>He only walks while someone is watching.</h1>
    </div>
  );
}
