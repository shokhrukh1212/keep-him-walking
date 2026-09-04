export function calendarTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function journeyCalendarEvent(input: { cityName: string; countryName: string; startsAt: Date; endsAt: Date; url: string }) {
  const stamp = calendarTimestamp(new Date());
  const uid = `country-${input.startsAt.toISOString()}-${input.cityName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}@keephimwalking`;
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Keep Him Walking//Journey Reminder//EN", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART:${calendarTimestamp(input.startsAt)}`, `DTEND:${calendarTimestamp(input.endsAt)}`,
    `SUMMARY:${escapeIcs(`Keep Him Walking — ${input.cityName}`)}`,
    `DESCRIPTION:${escapeIcs(`Join the shared walk through ${input.cityName}, ${input.countryName}. He only walks while someone is watching.`)}`,
    `URL:${escapeIcs(input.url)}`, "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
