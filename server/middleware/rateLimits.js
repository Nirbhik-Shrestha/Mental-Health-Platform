import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { isTest } from "../config/env.js";

const message = { error: "Too many attempts. Please wait a few minutes and try again" };
const common = { standardHeaders: "draft-8", legacyHeaders: false, message };

// Per account + IP, so one attacker can't lock everyone out and can't hammer one account.
// Successful logins don't count.
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username ?? "").toLowerCase()}`,
});

// Registration, password reset, verification emails.
export const accountLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skip: () => isTest,
});

export const apiLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  limit: 300,
  skip: () => isTest,
});
