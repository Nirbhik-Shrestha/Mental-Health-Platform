import mongoose from "mongoose";
import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { startReminderJob } from "./jobs/reminders.js";
import { startLinkCheckJob } from "./jobs/linkCheck.js";
import { mailConfigured } from "./lib/mailer.js";

await mongoose.connect(env.mongoUri);

createApp().listen(env.port, () => {
  console.log(`Aashraya API listening on http://localhost:${env.port}`);
  if (!mailConfigured()) console.log("SMTP not configured: emails will be printed to this console instead.");
});

if (env.remindersEnabled) startReminderJob();
if (env.linkCheckEnabled) startLinkCheckJob();
