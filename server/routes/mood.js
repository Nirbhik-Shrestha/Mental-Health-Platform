import express from "express";
import { z } from "zod";
import Mood from "../models/Mood.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { optionalText } from "../lib/schemas.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { toDay, addDays } from "../lib/dates.js";
import { MOODS, MOOD_TAGS, MOOD_SCORES, currentStreak, longestStreak } from "../lib/moods.js";
import { supportSignals } from "../lib/support.js";
import { maybeAutoAlert } from "../lib/trustedContact.js";

const router = express.Router();
router.use(requireAuth);

const serialize = (entry) => ({
  _id: entry._id,
  day: entry.day,
  mood: entry.mood,
  tags: entry.tags ?? [],
  note: decrypt(entry.note) ?? "",
  timestamp: entry.timestamp,
});

async function streakFor(userId) {
  const days = await Mood.distinct("day", { userId });
  return { streak: currentStreak(days, toDay()), longestStreak: longestStreak(days), totalDays: days.length };
}

router.get("/options", (_req, res) => {
  res.json({ moods: MOODS, tags: MOOD_TAGS });
});

const checkInSchema = z.object({
  mood: z.enum(MOODS),
  tags: z.array(z.enum(MOOD_TAGS)).max(MOOD_TAGS.length).default([]),
  note: optionalText(1000),
});

// Log today's check-in, or update it if one already exists.
router.post("/", validate(checkInSchema), async (req, res) => {
  const { mood, tags, note } = req.body;
  const update = { $set: { mood, tags: [...new Set(tags)], timestamp: new Date() } };
  if (note) update.$set.note = encrypt(note);
  else update.$unset = { note: 1 };

  const entry = await Mood.findOneAndUpdate({ userId: req.user._id, day: toDay() }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  const [streak, support] = await Promise.all([streakFor(req.user._id), supportSignals(req.user._id)]);
  const contactNotified = await maybeAutoAlert(req.user._id, support).catch(() => false);
  res.status(201).json({ entry: serialize(entry), ...streak, support, contactNotified });
});

router.get("/today", async (req, res) => {
  const entry = await Mood.findOne({ userId: req.user._id, day: toDay() });
  res.json({ entry: entry ? serialize(entry) : null });
});

const rangeSchema = z.object({ days: z.coerce.number().int().min(1).max(3650).default(365) });

router.get("/history", validate(rangeSchema, "query"), async (req, res) => {
  const since = addDays(toDay(), -(req.validQuery.days - 1));
  const entries = await Mood.find({ userId: req.user._id, day: { $gte: since } }).sort({ day: -1 });
  res.json({ entries: entries.map(serialize) });
});

router.get("/insights", validate(rangeSchema, "query"), async (req, res) => {
  const userId = req.user._id;
  const today = toDay();
  const since = addDays(today, -(req.validQuery.days - 1));
  const entries = await Mood.find({ userId, day: { $gte: since } }).sort({ day: 1 }).lean();

  const distribution = Object.fromEntries(MOODS.map((mood) => [mood, 0]));
  const tagTotals = {};
  let scoreSum = 0;
  for (const { mood, tags = [] } of entries) {
    distribution[mood] += 1;
    scoreSum += MOOD_SCORES[mood];
    for (const tag of tags) {
      tagTotals[tag] ??= { sum: 0, count: 0 };
      tagTotals[tag].sum += MOOD_SCORES[mood];
      tagTotals[tag].count += 1;
    }
  }
  const round = (n) => Math.round(n * 100) / 100;

  const [streak, support] = await Promise.all([streakFor(userId), supportSignals(userId)]);
  res.json({
    range: { from: since, to: today, days: req.validQuery.days },
    ...streak,
    checkIns: entries.length,
    average: entries.length ? round(scoreSum / entries.length) : null,
    distribution,
    trend: entries.map(({ day, mood }) => ({ day, mood, score: MOOD_SCORES[mood] })),
    // Average mood on days with each tag - hints at what helps or hurts.
    tags: Object.entries(tagTotals)
      .map(([tag, { sum, count }]) => ({ tag, count, average: round(sum / count) }))
      .sort((a, b) => b.count - a.count),
    scale: MOOD_SCORES,
    support,
  });
});

export default router;
