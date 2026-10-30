import { env } from "../config/env.js";
import { requireRole } from "./auth.js";

const adminRole = requireRole("admin");

/** Admin role, plus two-factor sign-in when REQUIRE_ADMIN_2FA=true. */
export const requireAdmin = (req, res, next) =>
  adminRole(req, res, () => {
    if (env.requireAdmin2fa && !req.user.twoFactor?.enabled) {
      return res.status(403).json({
        error: "Turn on two-factor sign-in in your profile to use admin tools",
        code: "two_factor_required",
      });
    }
    next();
  });
