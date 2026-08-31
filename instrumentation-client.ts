import { vemetric } from "@vemetric/web";

const token = process.env.NEXT_PUBLIC_VEMETRIC_TOKEN;

if (token) {
  try {
    vemetric.init({ token });
  } catch {
    // Analytics is optional and must never prevent the journey from loading.
  }
}
