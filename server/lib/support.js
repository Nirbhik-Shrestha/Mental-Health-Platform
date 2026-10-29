import Mood from "../models/Mood.js";
import ForumPost from "../models/ForumPost.js";
import { NEGATIVE_MOODS } from "./moods.js";
import { addDays, toDay } from "./dates.js";

const LOOKBACK_DAYS = 14;
const RUN_LENGTH = 3;

/**
 * Should we gently surface support resources to this user?
 * True when their last few check-ins, or last few forum posts, were all negative
 * within the past two weeks.
 */
export async function supportSignals(userId) {
  const since = addDays(toDay(), -LOOKBACK_DAYS);
  const sinceDate = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [moods, posts] = await Promise.all([
    Mood.find({ userId, day: { $gte: since } }).sort({ day: -1 }).limit(RUN_LENGTH).select("mood").lean(),
    ForumPost.find({ author: userId, createdAt: { $gte: sinceDate } })
      .sort({ createdAt: -1 })
      .limit(RUN_LENGTH)
      .select("sentiment")
      .lean(),
  ]);

  const reasons = [];
  if (moods.length === RUN_LENGTH && moods.every((m) => NEGATIVE_MOODS.has(m.mood))) reasons.push("moods");
  if (posts.length === RUN_LENGTH && posts.every((p) => p.sentiment === "negative")) reasons.push("posts");
  return { needsSupport: reasons.length > 0, reasons };
}
