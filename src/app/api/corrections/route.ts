import { handleCorrectionPost } from "./handler";
import { withRouteTelemetry } from "@/lib/observability/route";

export const POST = withRouteTelemetry("corrections", handleCorrectionPost);
