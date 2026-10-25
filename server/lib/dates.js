// All "day" logic uses Nepal time so check-ins line up with the user's calendar day
// (Nepal is UTC+5:45, so UTC midnight would split a Nepali day in two).
export const TIMEZONE = "Asia/Kathmandu";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const hourFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIMEZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

/** Calendar day in Nepal as YYYY-MM-DD. */
export const toDay = (date = new Date()) => dayFormatter.format(date);

/** Hour of day (0-23) in Nepal. */
export const hourIn = (date = new Date()) => Number(hourFormatter.format(date));

/** Shift a YYYY-MM-DD day string by n days. */
export function addDays(day, n) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}
