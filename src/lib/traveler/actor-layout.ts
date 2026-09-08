import type { StageLayout } from "../world/stage-layout";

/** Both adult actors use the world's calibrated pixels per metre and foot plane. */
export function actorLayout(viewportHeight: number, stage: StageLayout) {
  return { height: stage.personHeightPx, bottom: viewportHeight - stage.groundY };
}
