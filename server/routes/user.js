import express from "express";
import User from '../models/User.js';
import { verifyToken } from '../middleware/auth.js'; 


const router = express.Router();

// routes/user.js
router.get("/", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
    console.log("User fetched:", user);

  } catch (err) {
    res.status(500).json({ message: "Failed to fetch user", error: err.message });
    
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


router.put("/", verifyToken, async (req, res) => {
  const { username, email, contact, address, dob } = req.body;
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { username, email, contact, address, dob },
      { new: true, runValidators: true }
    ).select("-password");

    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Failed to update profile", error: err.message });
  }
});


export default router;