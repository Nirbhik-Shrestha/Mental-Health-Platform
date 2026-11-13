import express from "express";
import { z } from "zod";
import JournalEntry, { ENTRY_KINDS } from "../models/JournalEntry.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { optional, optionalText } from "../lib/schemas.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { MOODS } from "../lib/moods.js";

// Private journal. Title and content are encrypted at rest; only the owner can read them.
const router = express.Router();
router.use(requireAuth);

const serialize = (entry) => ({
  _id: entry._id,
  title: decrypt(entry.title) ?? "",
  content: decrypt(entry.content),
  mood: entry.mood ?? null,
  kind: entry.kind ?? "entry",
  promptId: entry.promptId ?? null,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const entrySchema = z.object({
  title: optionalText(200),
  content: z.string().trim().min(1, "Write something first").max(20000),
  mood: optional(z.enum(MOODS)),
  kind: z.enum(ENTRY_KINDS).default("entry"),
  promptId: optional(z.number().int().min(0).max(100)),
});

const toDocument = ({ title, content, mood, kind, promptId }) => ({
  title: encrypt(title),
  content: encrypt(content),
  mood,
  kind,
  promptId: kind === "prompt" ? promptId : undefined,
});

const findOwn = (req) => JournalEntry.findOne({ _id: req.params.id, userId: req.user._id });

router.get("/", async (req, res) => {
  const entries = await JournalEntry.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(500);
  res.json({ entries: entries.map(serialize) });
});

router.post("/", validate(entrySchema), async (req, res) => {
  const entry = await JournalEntry.create({ userId: req.user._id, ...toDocument(req.body) });
  res.status(201).json({ entry: serialize(entry) });
});

router.put("/:id", validate(entrySchema), async (req, res) => {
  const entry = await findOwn(req);
  if (!entry) return res.status(404).json({ error: "Entry not found" });
  entry.set(toDocument(req.body));
  await entry.save();
  res.json({ entry: serialize(entry) });
});

router.delete("/:id", async (req, res) => {
  const result = await JournalEntry.deleteOne({ _id: req.params.id, userId: req.user._id });
  if (!result.deletedCount) return res.status(404).json({ error: "Entry not found" });
  res.status(204).end();
});

export default router;
