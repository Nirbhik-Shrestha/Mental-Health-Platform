import { addDays } from "./dates.js";

// Score used for charts and averages (higher = better).
export const MOOD_SCORES = { Happy: 5, Calm: 4, Okay: 3, Anxious: 2, Angry: 2, Sad: 1 };
export const MOODS = Object.keys(MOOD_SCORES);
export const NEGATIVE_MOODS = new Set(["Sad", "Anxious", "Angry"]);

// Optional context a user can attach to a check-in; labels are translated on the client.
export const MOOD_TAGS = [
  "sleep",
  "exercise",
  "work",
  "study",
  "family",
  "friends",
  "relationship",
  "health",
  "money",
  "alone",
];

/**
 * Consecutive days with a check-in, counting back from today.
 * A streak isn't broken until a whole day is missed, so if today has no entry yet
 * the streak still counts from yesterday.
 * @param {string[]} days unique YYYY-MM-DD strings, any order
 */
export function currentStreak(days, today) {
  const logged = new Set(days);
  let cursor = logged.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days) {
  const sorted = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of sorted) {
    run = previous && addDays(previous, 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }
  return longest;
}
