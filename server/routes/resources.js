import express from "express";
import { z } from "zod";
import Resource, { RESOURCE_TYPES, RESOURCE_TOPICS } from "../models/Resource.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { validate } from "../middleware/validate.js";
import { optional, optionalText, stringList } from "../lib/schemas.js";
import { audit } from "../lib/audit.js";

const router = express.Router();

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  topic: z.enum(RESOURCE_TOPICS).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
});

// Public reading list.
router.get("/", validate(searchSchema, "query"), async (req, res) => {
  const { q, topic, type } = req.validQuery;
  const filter = {};
  if (topic) filter.topics = topic;
  if (type) filter.type = type;
  if (q) {
    const pattern = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: pattern }, { publisher: pattern }, { "summary.en": pattern }, { "summary.ne": pattern }];
  }
  const resources = await Resource.find(filter).sort({ year: -1, title: 1 });
  res.json({ resources, topics: RESOURCE_TOPICS, types: RESOURCE_TYPES });
});

const resourceSchema = z.object({
  title: z.string().trim().min(3).max(300),
  publisher: z.string().trim().min(2).max(200),
  authors: optionalText(300),
  year: optional(z.number().int().min(1900).max(2100)),
  type: z.enum(RESOURCE_TYPES),
  topics: z.array(z.enum(RESOURCE_TOPICS)).max(RESOURCE_TOPICS.length).default([]),
  summary: z.object({
    en: z.string().trim().min(10).max(2000),
    ne: optionalText(2000),
  }),
  url: z.url("Enter a full URL, e.g. https://example.org").max(500),
  languages: stringList(10, 40).default([]),
  openAccess: z.boolean().default(true),
  checkedAt: optional(z.iso.date()),
});

router.post("/", requireAuth, requireAdmin, validate(resourceSchema), async (req, res) => {
  const resource = await Resource.create(req.body);
  await audit(req, "resource.create", { targetType: "resource", targetId: resource._id, details: { title: resource.title } });
  res.status(201).json({ resource });
});

router.put("/:id", requireAuth, requireAdmin, validate(resourceSchema), async (req, res) => {
  const resource = await Resource.findById(req.params.id);
  if (!resource) return res.status(404).json({ error: "Resource not found" });
  for (const field of Object.keys(resourceSchema.shape)) resource.set(field, req.body[field]);
  await resource.save();
  await audit(req, "resource.update", { targetType: "resource", targetId: resource._id, details: { title: resource.title } });
  res.json({ resource });
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  const result = await Resource.deleteOne({ _id: req.params.id });
  if (!result.deletedCount) return res.status(404).json({ error: "Resource not found" });
  await audit(req, "resource.delete", { targetType: "resource", targetId: req.params.id });
  res.status(204).end();
});

export default router;
