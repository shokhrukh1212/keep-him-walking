/** One footfall. Two make the 1.2 s cycle every walk take is timed to. */
export const STEP_DURATION_SECONDS = 0.6;
export const GAIT_CYCLE_SECONDS = STEP_DURATION_SECONDS * 2;
/**
 * 0.9 m a step, 1.5 m/s. The approved walk take moves its planted foot at about 1.48 m/s
 * at his 1.78 m height, so at this pace his feet stay on the pavement (owner decision,
 * 13 September 2026). The database accrues distance at the same pace
 * (`walking_metres_per_second`, migration 0039).
 */
export const METRES_PER_STEP = 0.9;
export const METRES_PER_SECOND = METRES_PER_STEP / STEP_DURATION_SECONDS;
