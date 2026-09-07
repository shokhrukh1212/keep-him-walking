export function validCronAuthorization(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && header === `Bearer ${secret}`);
}
