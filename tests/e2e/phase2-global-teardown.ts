import { rm } from "node:fs/promises";
import { PHASE2_VERCEL_STORAGE_STATE } from "./phase2-global-setup";

export default async function phase2GlobalTeardown() {
  await rm(PHASE2_VERCEL_STORAGE_STATE, { force: true });
}
