import express from "express";
import { z } from "zod";
import SafetyPlan from "../models/SafetyPlan.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { stringList } from "../lib/schemas.js";
import { encrypt, decrypt } from "../lib/crypto.js";

// A personal crisis safety plan (based on the Stanley-Brown Safety Planning Intervention).
const router = express.Router();
router.use(requireAuth);

const list = stringList(15, 300).default([]);
const contacts = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(100),
      phone: z.string().trim().min(3).max(30),
    })
  )
  .max(10)
  .default([]);

const planSchema = z.object({
  warningSigns: list,
  copingStrategies: list,
  distractions: list, // people and places that take my mind off things
  reasonsToLive: list,
  supportContacts: contacts, // people I can ask for help
  professionalContacts: contacts,
  safeEnvironment: list, // making my surroundings safer
});

const EMPTY_PLAN = planSchema.parse({});

router.get("/", async (req, res) => {
  const plan = await SafetyPlan.findOne({ userId: req.user._id });
  res.json({
    plan: plan ? { ...EMPTY_PLAN, ...JSON.parse(decrypt(plan.data)) } : EMPTY_PLAN,
    updatedAt: plan?.updatedAt ?? null,
  });
});

router.put("/", validate(planSchema), async (req, res) => {
  const plan = await SafetyPlan.findOneAndUpdate(
    { userId: req.user._id },
    { $set: { data: encrypt(JSON.stringify(req.body)) } },
    { upsert: true, new: true }
  );
  res.json({ plan: req.body, updatedAt: plan.updatedAt });
});

export default router;
