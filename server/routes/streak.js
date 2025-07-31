import express from 'express';
import { updateStreak } from '../controllers/streakController.js';
import { verifyToken } from '../middleware/auth.js'; 
import User from '../models/User.js';

const router = express.Router();

router.get("/", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const today = new Date();
    const lastActive = new Date(user.lastActiveDate || 0);

    const diffDays = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      user.streak += 1;
    } else if (diffDays > 1) {
      user.streak = 1;
    }

    user.lastActiveDate = today;
    // await user.save();

    res.json({ streak: user.streak });
  } catch (err) {
    console.error("Error fetching/updating streak:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post('/update', verifyToken, updateStreak);

export default router;
