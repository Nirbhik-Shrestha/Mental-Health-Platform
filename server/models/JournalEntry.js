import mongoose from "mongoose";
import { MOODS } from "../lib/moods.js";

export const ENTRY_KINDS = ["entry", "prompt", "gratitude", "thought-record"];

// title and content are encrypted at rest (see lib/crypto.js)
const journalEntrySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String },
    content: { type: String, required: true },
    mood: { type: String, enum: MOODS },
    kind: { type: String, enum: ENTRY_KINDS, default: "entry" },
    promptId: { type: Number }, // index into the client's prompt list, for "prompt" entries
  },
  { timestamps: true }
);

export default mongoose.model("JournalEntry", journalEntrySchema);
