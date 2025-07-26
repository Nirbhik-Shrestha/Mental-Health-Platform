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
      userId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });
    
    if (existing) {
      return res.status(400).json({ message: "Mood already submitted for today." });
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

export default router;
