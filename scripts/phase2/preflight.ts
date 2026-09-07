import { phase2EnvironmentIdentity } from "./environment";

const identity = await phase2EnvironmentIdentity();
process.stdout.write(`${JSON.stringify({ isolated: true, projectRef: identity.projectRef, fingerprint: identity.fingerprint, secretsPrinted: false })}\n`);
