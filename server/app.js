import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimits.js";
import { notFound, errorHandler } from "./middleware/errors.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import moodRoutes from "./routes/mood.js";
import streakRoutes from "./routes/streak.js";
import journalRoutes from "./routes/journal.js";
import safetyPlanRoutes from "./routes/safetyPlan.js";
import forumRoutes from "./routes/forum.js";
import blogRoutes from "./routes/blog.js";
import centerRoutes from "./routes/center.js";
import resourceRoutes from "./routes/resources.js";
import notificationRoutes from "./routes/notifications.js";
import assessmentRoutes from "./routes/assessments.js";
import trustedContactRoutes from "./routes/trustedContact.js";
import appointmentRoutes from "./routes/appointments.js";
import programRoutes from "./routes/programs.js";
import adminRoutes from "./routes/admin.js";

export function createApp() {
  const app = express();

  if (env.trustProxy) app.set("trust proxy", env.trustProxy);
  app.use(helmet());
  app.use(cors({ origin: env.clientOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use("/api", apiLimiter);

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", authRoutes);
  app.use("/api/me", userRoutes);
  app.use("/api/mood", moodRoutes);
  app.use("/api/streak", streakRoutes);
  app.use("/api/journal", journalRoutes);
  app.use("/api/safety-plan", safetyPlanRoutes);
  app.use("/api/forum", forumRoutes);
  app.use("/api/blogs", blogRoutes);
  app.use("/api/centers", centerRoutes);
  app.use("/api/resources", resourceRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/assessments", assessmentRoutes);
  app.use("/api/trusted-contact", trustedContactRoutes);
  app.use("/api/appointments", appointmentRoutes);
  app.use("/api/programs", programRoutes);
  app.use("/api/admin", adminRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
