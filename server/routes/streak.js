import express from "express";
import Mood from "../models/Mood.js";
import { requireAuth } from "../middleware/auth.js";
import { currentStreak } from "../lib/moods.js";
import { toDay } from "../lib/dates.js";

// Kept for the navbar badge; the streak is derived from daily mood check-ins.
const router = express.Router();

router.get("/", requireAuth, async (req, res) => {
  const days = await Mood.distinct("day", { userId: req.user._id });
  res.json({ streak: currentStreak(days, toDay()) });
});

export default router;
