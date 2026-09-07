type Context = Record<string, unknown>;
const SENSITIVE_KEY = /(authorization|cookie|secret|token|password|visitor|email|payload|signature)/i;

export function redactContext(context: Context): Context {
  return Object.fromEntries(Object.entries(context).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? "[REDACTED]" : value]));
}
