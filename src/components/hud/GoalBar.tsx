type Props = {
  distanceMetres: number;
  landmarkMetres: number;
  marathonMetres: number;
  freshness: "extrapolated" | "last confirmed";
};

function kilometres(metres: number) {
  const value = Math.max(0, metres) / 1_000;
  const precision = Number.isInteger(value) || value >= 10 ? 0 : 1;
  return `${value.toFixed(precision)} km`;
}

export function GoalBar({ distanceMetres, landmarkMetres, marathonMetres, freshness }: Props) {
  const distance = Math.max(0, distanceMetres);
  const marathonProgress = Math.min(1, distance / marathonMetres);
  const fill = Math.min(1, distance / landmarkMetres);
  const marathon = distance >= marathonMetres;
  const goalReached = distance >= landmarkMetres;
  return (
    <section
      className="goal-bar"
      data-hud-region="goal"
      data-marathon={marathon}
      aria-label={`Journey distance ${kilometres(distance)}, ${freshness}`}
    >
      <div className="goal-track" aria-hidden="true">
        <span style={{ width: `${fill * 100}%` }} />
      </div>
      <div className="goal-copy">
        <strong>{goalReached ? `${kilometres(landmarkMetres)} reached` : `${kilometres(distance)} together`} <small>{freshness}</small></strong>
        <span>{goalReached
          ? `next: ${kilometres(marathonMetres)}`
          : `${kilometres(landmarkMetres - distance)} to today’s collective goal`}</span>
        <span>{Math.floor(marathonProgress * 100)}% of a marathon</span>
      </div>
    </section>
  );
}
