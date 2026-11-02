import mongoose from "mongoose";
import { MOODS, MOOD_TAGS } from "../lib/moods.js";

const moodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  mood: { type: String, enum: MOODS, required: true },
  // Calendar day in Nepal time (YYYY-MM-DD); one check-in per user per day.
  day: { type: String, required: true },
  tags: [{ type: String, enum: MOOD_TAGS }],
  note: { type: String }, // encrypted
  timestamp: { type: Date, default: Date.now },
});

moodSchema.index({ userId: 1, day: 1 }, { unique: true });

export default mongoose.model("Mood", moodSchema);
