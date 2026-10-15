// controllers/authController.js
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import moment from "moment-timezone";



export const register = async (req, res) => {
  try {
    const { username, password, email, contact, address, dob, role } = req.body;
    const kathmanduTime = moment().tz("Asia/Kathmandu").toDate();

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ error: "Username already taken" });

    const hashed = await bcrypt.hash(password, 10);

    await User.create({
      username,
      password: hashed,
      email,
      contact,
      address,
      dob,
      lastActiveDate: kathmanduTime,
      role
    });

    res.status(201).json({ message: "Registered successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Registration failed" });
  }
};


export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
  
};
// ✅ Correct for ES modules
export const updateStreak = async (req, res) => {
  const userId = req.user.id;
  const user = await User.findById(userId);

  const today = new Date();
  const lastActive = new Date(user.lastActiveDate);
  const diffDays = Math.floor((today - lastActive) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    user.streak += 1; // Continue streak
  } else if (diffDays > 1) {
    user.streak = 1; // Streak broken
  }

  user.lastActiveDate = today;
  await user.save();

  res.json({ streak: user.streak });
};

