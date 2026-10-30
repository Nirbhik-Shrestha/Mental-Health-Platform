import jwt from "jsonwebtoken";
import { env, isProduction } from "../config/env.js";
import User from "../models/User.js";

export const SESSION_COOKIE = "aashraya_session";
// Browsers send this on every API call. Other sites can't add custom headers to
// cross-site requests without passing CORS, so requiring it blocks CSRF.
export const CSRF_HEADER = "x-requested-with";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export const signToken = (user) =>
  jwt.sign({ sub: user._id.toString(), ver: user.tokenVersion ?? 0 }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });

/** Starts a browser session in an httpOnly cookie (not readable by page scripts). */
export function setSessionCookie(res, user) {
  res.cookie(SESSION_COOKIE, signToken(user), {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/api",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export const clearSessionCookie = (res) =>
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: isProduction, sameSite: "lax", path: "/api" });

/** Signs out every existing session for the user (call before saving). */
export const revokeSessions = (user) => {
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
};

const expired = (res) => res.status(401).json({ error: "Your session has expired. Please log in again" });

/**
 * Accepts a session cookie (browsers) or a bearer token (API clients), then loads
 * the user from the database so role changes, deletions and password resets apply
 * immediately. Sets req.user to the User document.
 */
export const requireAuth = async (req, res, next) => {
  const [scheme, bearer] = (req.headers.authorization ?? "").split(" ");
  const fromHeader = scheme === "Bearer" && bearer;
  const token = fromHeader ? bearer : req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ error: "Please log in to continue" });

  if (!fromHeader && !SAFE_METHODS.has(req.method) && !req.get(CSRF_HEADER)) {
    return res.status(403).json({ error: "Request blocked for your security. Please reload the page" });
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    return expired(res);
  }
  if (payload.purpose) return expired(res); // e.g. a two-factor challenge, not a session

  // Tokens from the first version have an `id` claim and no `ver`.
  const user = await User.findById(payload.sub ?? payload.id);
  if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) return expired(res);

  req.user = user;
  next();
};

/** Like requireAuth, but continues without a user when not logged in. */
export const optionalAuth = (req, res, next) => {
  const hasCredentials = req.headers.authorization || req.cookies?.[SESSION_COOKIE];
  if (!hasCredentials) return next();
  return requireAuth(req, res, next);
};

export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: "You don't have permission to do that" });
    }
    next();
  };
