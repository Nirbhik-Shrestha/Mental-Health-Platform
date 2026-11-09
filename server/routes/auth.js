import express from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import User from "../models/User.js";
import { requireAuth, signToken, revokeSessions, setSessionCookie, clearSessionCookie } from "../middleware/auth.js";
import { signChallenge, readChallenge, verifyCode } from "../lib/twoFactor.js";
import { validate } from "../middleware/validate.js";
import { loginLimiter, accountLimiter } from "../middleware/rateLimits.js";
import { randomToken, hashToken } from "../lib/crypto.js";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/emails.js";
import { username, email, password, phone, optional, optionalText, dob } from "../lib/schemas.js";

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
export const hashPassword = (plain) => bcrypt.hash(plain, 12);

// Browsers use the httpOnly cookie; the token is also returned for API clients.
function startSession(res, user) {
  setSessionCookie(res, user);
  res.json({ token: signToken(user), user: user.toJSON() });
}

const registerSchema = z.object({
  username,
  email,
  password,
  contact: optional(phone),
  address: optionalText(200),
  dob: optional(dob),
  language: z.enum(["en", "ne"]).optional(),
});

router.post("/register", accountLimiter, validate(registerSchema), async (req, res) => {
  // Only whitelisted fields are used, so a client can't register itself as an admin.
  const { username, email, password, contact, address, dob, language } = req.body;

  if (await User.exists({ $or: [{ username }, { email }] })) {
    return res.status(409).json({ error: "That username or email is already registered" });
  }

  const verificationToken = randomToken();
  const user = await User.create({
    username,
    email,
    password: await hashPassword(password),
    contact,
    address,
    dob,
    preferences: { language: language ?? "en" },
    emailVerificationToken: hashToken(verificationToken),
  });
  await sendVerificationEmail(user, verificationToken);

  res.status(201).json({ message: "Registered successfully" });
});

const loginSchema = z.object({
  username: z.string().trim().min(1).max(254), // username or email
  password: z.string().min(1).max(128),
});

router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({
    $or: [{ username }, { email: username.toLowerCase() }],
  }).select("+password");

  // Same message either way so the login form doesn't reveal which usernames exist.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Incorrect username or password" });
  }

  if (user.twoFactor?.enabled) {
    return res.json({ twoFactorRequired: true, challenge: signChallenge(user) });
  }
  startSession(res, user);
});

// Second login step for accounts with two-factor sign-in.
router.post(
  "/login/2fa",
  loginLimiter,
  validate(z.object({ challenge: z.string().min(1).max(1000), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") })),
  async (req, res) => {
    const userId = readChallenge(req.body.challenge);
    const user = userId && (await User.findById(userId).select("+twoFactor.secret"));
    if (!user) return res.status(401).json({ error: "Your sign-in took too long. Please start again" });
    if (!(await verifyCode(user.twoFactor.secret, req.body.code))) {
      return res.status(401).json({ error: "That code didn't work. Check your authenticator app and try again" });
    }
    startSession(res, user);
  }
);

router.post("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user.toJSON() });
});

router.post(
  "/verify-email",
  accountLimiter,
  validate(z.object({ token: z.string().min(1).max(200) })),
  async (req, res) => {
    const user = await User.findOne({ emailVerificationToken: hashToken(req.body.token) });
    if (!user) return res.status(400).json({ error: "This verification link is invalid or was already used" });

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    await user.save();
    res.json({ message: "Email verified" });
  }
);

router.post("/resend-verification", accountLimiter, requireAuth, async (req, res) => {
  if (req.user.emailVerified) return res.json({ message: "Email already verified" });

  const token = randomToken();
  req.user.emailVerificationToken = hashToken(token);
  await req.user.save();
  await sendVerificationEmail(req.user, token);
  res.json({ message: "Verification email sent" });
});

router.post("/forgot-password", accountLimiter, validate(z.object({ email })), async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (user) {
    const token = randomToken();
    user.passwordResetToken = hashToken(token);
    user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await user.save();
    await sendPasswordResetEmail(user, token);
  }
  // Same response whether or not the email exists.
  res.json({ message: "If that email is registered, a reset link is on its way" });
});

router.post(
  "/reset-password",
  accountLimiter,
  validate(z.object({ token: z.string().min(1).max(200), password })),
  async (req, res) => {
    const user = await User.findOne({
      passwordResetToken: hashToken(req.body.token),
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: "This reset link is invalid or has expired" });

    user.password = await hashPassword(req.body.password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    revokeSessions(user);
    // Reaching the inbox proves ownership of the email.
    user.emailVerified = true;
    await user.save();
    res.json({ message: "Password updated. You can log in now" });
  }
);

export default router;
