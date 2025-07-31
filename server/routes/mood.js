// routes/mood.js
import Mood from "../models/Mood.js";
import { verifyToken } from "../middleware/auth.js";
import express from "express";

const router = express.Router();

router.post("/", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { mood } = req.body;


  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  try {
    const existing = await Mood.findOne({
      userId: req.user.id,
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    }); 
    
    if (existing) {
  return res.status(409).json({ message: "Mood already logged today" });
}

    console.log(existing)
    console.log(startOfDay)
    console.log(endOfDay)

    const newMood = new Mood({ userId, mood });
    await newMood.save();
    res.status(201).json({ message: "Mood recorded", mood: newMood });
  } catch (err) {
    console.error("Error saving mood:", err);
    res.status(500).json({ message: "Error saving mood", error: err.message });
  }
});


router.get("/today", verifyToken, async (req, res) => {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));

  try {
    const moodEntry = await Mood.findOne({
      userId: req.user.id,
      timestamp: { $gte: startOfDay, $lte: endOfDay }
    });

    if (moodEntry) {
      res.json({ mood: moodEntry.mood });
    } else {
      res.status(404).json({ message: "No mood logged today" });
    }
  } catch (err) {
    console.error("Error fetching today's mood:", err);
    res.status(500).json({ message: "Error fetching today's mood", error: err.message });
  }
});

// Get mood history
router.get("/history", verifyToken, async (req, res) => {
  try {
    const moods = await Mood.find({ userId: req.user.id })
      .sort({ timestamp: -1 }); // most recent first
    res.json(moods);
  } catch (err) {
    console.error("Error fetching mood history:", err);
    res.status(500).json({ message: "Error fetching mood history", error: err.message });
  }
});


export default router;
