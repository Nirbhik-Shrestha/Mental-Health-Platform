import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User, { LANGUAGES } from "../models/User.js";
import { requireAuth, signToken, revokeSessions, setSessionCookie, clearSessionCookie } from "../middleware/auth.js";
import { newTwoFactorSetup, verifyCode } from "../lib/twoFactor.js";
import { validate } from "../middleware/validate.js";
import { username, email, password, phone, optional, optionalText, dob } from "../lib/schemas.js";
import { randomToken, hashToken, encrypt } from "../lib/crypto.js";
import { sendVerificationEmail } from "../lib/emails.js";
import { deleteUserAndData, exportUserData } from "../lib/accounts.js";
import { hashPassword } from "./auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  res.json({ user: req.user.toJSON() });
});

// The full profile is sent each time; a missing optional field means "clear it".
const profileSchema = z.object({
  username,
  email,
  contact: optional(phone),
  address: optionalText(200),
  dob: optional(dob),
});

router.put("/", validate(profileSchema), async (req, res) => {
  const user = req.user;
  const { username, email, contact, address, dob } = req.body;

  const conflict = await User.exists({ _id: { $ne: user._id }, $or: [{ username }, { email }] });
  if (conflict) return res.status(409).json({ error: "That username or email is already in use" });

  const emailChanged = email !== user.email;
  user.set({ username, email, contact, address, dob });

  let verificationToken;
  if (emailChanged) {
    verificationToken = randomToken();
    user.emailVerified = false;
    user.emailVerificationToken = hashToken(verificationToken);
  }
  await user.save();
  if (emailChanged) await sendVerificationEmail(user, verificationToken);

  res.json({ user: user.toJSON() });
});

router.put(
  "/password",
  validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password })),
  async (req, res) => {
    const user = await User.findById(req.user._id).select("+password");
    if (!(await bcrypt.compare(req.body.currentPassword, user.password))) {
      return res.status(400).json({ error: "Your current password is incorrect" });
    }
    user.password = await hashPassword(req.body.newPassword);
    // Signs out other sessions; this one gets a fresh session below.
    revokeSessions(user);
    await user.save();
    setSessionCookie(res, user);
    res.json({ message: "Password changed", token: signToken(user) });
  }
);

const preferencesSchema = z.object({
  language: z.enum(LANGUAGES).optional(),
  reminders: z
    .object({
      enabled: z.boolean(),
      hour: z.number().int().min(0).max(23),
    })
    .optional(),
});

router.put("/preferences", validate(preferencesSchema), async (req, res) => {
  const { language, reminders } = req.body;
  if (language) req.user.preferences.language = language;
  if (reminders) req.user.preferences.reminders = reminders;
  await req.user.save();
  res.json({ user: req.user.toJSON() });
});

router.get("/export", async (req, res) => {
  const data = await exportUserData(req.user);
  res.setHeader("Content-Disposition", `attachment; filename="aashraya-data-${req.user.username}.json"`);
  res.json(data);
});

router.delete(
  "/",
  validate(z.object({ password: z.string().min(1).max(128) })),
  async (req, res) => {
    const user = await User.findById(req.user._id).select("+password");
    if (!(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ error: "Your password is incorrect" });
    }
    await deleteUserAndData(user._id);
    clearSessionCookie(res);
    res.status(204).end();
  }
);

// Two-factor sign-in (TOTP authenticator apps)

router.post("/2fa/setup", async (req, res) => {
  if (req.user.twoFactor?.enabled) return res.status(400).json({ error: "Two-factor sign-in is already on" });
  const { secret, uri, qrDataUrl } = await newTwoFactorSetup(req.user.username);
  await User.updateOne({ _id: req.user._id }, { "twoFactor.pendingSecret": encrypt(secret) });
  res.json({ secret, uri, qrDataUrl });
});

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });

router.post("/2fa/enable", validate(codeSchema), async (req, res) => {
  const user = await User.findById(req.user._id).select("+twoFactor.pendingSecret");
  if (!(await verifyCode(user.twoFactor?.pendingSecret, req.body.code))) {
    return res.status(400).json({ error: "That code didn't work. Check the time on your phone and try again" });
  }
  user.twoFactor.secret = user.twoFactor.pendingSecret;
  user.twoFactor.pendingSecret = undefined;
  user.twoFactor.enabled = true;
  user.twoFactor.enabledAt = new Date();
  await user.save();
  res.json({ user: user.toJSON() });
});

router.post(
  "/2fa/disable",
  validate(codeSchema.extend({ password: z.string().min(1).max(128) })),
  async (req, res) => {
    const user = await User.findById(req.user._id).select("+password +twoFactor.secret");
    const passwordOk = await bcrypt.compare(req.body.password, user.password);
    if (!passwordOk || !(await verifyCode(user.twoFactor?.secret, req.body.code))) {
      return res.status(400).json({ error: "Your password or code is incorrect" });
    }
    user.twoFactor = { enabled: false };
    await user.save();
    res.json({ user: user.toJSON() });
  }
);

export default router;
