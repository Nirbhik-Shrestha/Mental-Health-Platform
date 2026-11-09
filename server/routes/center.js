import express from "express";
import { z } from "zod";
import Center from "../models/centerModel.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { accountLimiter } from "../middleware/rateLimits.js";
import CenterFeedback from "../models/CenterFeedback.js";
import { notify, adminIds } from "../lib/notify.js";
import { requireAdmin } from "../middleware/admin.js";
import { validate } from "../middleware/validate.js";
import { objectId, optional, optionalText, stringList } from "../lib/schemas.js";
import { audit } from "../lib/audit.js";

const router = express.Router();

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const contains = (text) => new RegExp(escapeRegex(text), "i");

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  language: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  internship: z.enum(["true", "false"]).optional(),
  mode: z.enum(["in-person", "online", "phone"]).optional(),
  slidingScale: z.enum(["true"]).optional(),
});

// Public directory search.
router.get("/", validate(searchSchema, "query"), async (req, res) => {
  const { q, language, location, internship, mode, slidingScale } = req.validQuery;
  const filter = {};
  if (q) {
    const pattern = contains(q);
    filter.$or = [{ name: pattern }, { location: pattern }, { services: pattern }, { approaches: pattern }];
  }
  if (language) filter.languages = contains(language);
  if (location) filter.location = contains(location);
  if (internship) filter.internship = internship === "true";
  if (mode) filter.modes = mode;
  if (slidingScale) filter.slidingScale = true;

  const centers = await Center.find(filter).sort({ verified: -1, name: 1 });
  res.json({ centers });
});

// Values for the directory's filter dropdowns.
router.get("/filters", async (_req, res) => {
  const [languages, locations] = await Promise.all([Center.distinct("languages"), Center.distinct("location")]);
  const clean = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  // "Jhamsikhel, Lalitpur" and "Kathmandu (Online-focused)" -> "Lalitpur", "Kathmandu"
  const cityOf = (location) => location.split(",").pop().replace(/\(.*?\)/g, "").trim();
  res.json({ languages: clean(languages), locations: clean(locations.filter(Boolean).map(cityOf)) });
});

const feedbackSchema = z
  .object({
    kind: z.enum(["report", "suggestion"]),
    centerId: optional(objectId),
    message: z.string().trim().min(5, "Tell us a little more").max(2000),
    suggested: optional(
      z.object({
        name: z.string().trim().min(2).max(200),
        location: optionalText(200),
        contact: optionalText(200),
        website: optional(z.url().max(300)),
      })
    ),
  })
  .refine((body) => body.kind !== "report" || body.centerId, { message: "Which center?", path: ["centerId"] })
  .refine((body) => body.kind !== "suggestion" || body.suggested, { message: "Add the center's name", path: ["suggested.name"] });

// Anyone can report outdated details or suggest a center; admins review them.
router.post("/feedback", accountLimiter, optionalAuth, validate(feedbackSchema), async (req, res) => {
  const { kind, centerId, message, suggested } = req.body;
  if (centerId && !(await Center.exists({ _id: centerId }))) return res.status(404).json({ error: "Center not found" });

  await CenterFeedback.create({ kind, center: centerId, message, suggested, submittedBy: req.user?._id });
  await notify(await adminIds(), { type: `center.${kind}`, link: "/admin/centers" });
  res.status(201).json({ message: "Thank you - our team will review this" });
});

router.get("/:id", async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) return res.status(404).json({ error: "Center not found" });
  res.json({ center });
});

const centerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  location: optionalText(200),
  services: stringList(30, 100).default([]),
  approaches: optionalText(1000),
  internship: z.boolean().default(false),
  hours: optionalText(200),
  languages: stringList(15, 50).default([]),
  fees: optionalText(200),
  modes: z.array(z.enum(["in-person", "online", "phone"])).max(3).default([]),
  slidingScale: z.boolean().default(false),
  contact: optionalText(200),
  website: optional(z.url("Enter a full URL, e.g. https://example.org").max(300)),
  coordinates: optional(
    z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
  ),
  verified: z.boolean().default(false),
  source: optional(
    z.object({
      kind: z.enum(["field-visit", "web"]),
      url: optional(z.url().max(500)),
      checkedAt: optional(z.iso.date()),
    })
  ),
});

router.post("/", requireAuth, requireAdmin, validate(centerSchema), async (req, res) => {
  const center = await Center.create(req.body);
  await audit(req, "center.create", { targetType: "center", targetId: center._id, details: { name: center.name } });
  res.status(201).json({ center });
});

router.put("/:id", requireAuth, requireAdmin, validate(centerSchema), async (req, res) => {
  const center = await Center.findById(req.params.id);
  if (!center) return res.status(404).json({ error: "Center not found" });
  // Fields left out of the form are cleared.
  for (const field of Object.keys(centerSchema.shape)) center.set(field, req.body[field]);
  await center.save();
  await audit(req, "center.update", { targetType: "center", targetId: center._id, details: { name: center.name } });
  res.json({ center });
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const result = await Center.deleteOne({ _id: req.params.id });
  if (!result.deletedCount) return res.status(404).json({ error: "Center not found" });
  await audit(req, "center.delete", { targetType: "center", targetId: req.params.id });
  res.status(204).end();
});

export default router;
