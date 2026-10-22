import cron from "node-cron";
import User from "../models/User.js";
import Mood from "../models/Mood.js";
import { sendReminderEmail } from "../lib/emails.js";
import { sendPush } from "../lib/push.js";
import { pushText } from "../lib/notify.js";
import { TIMEZONE, toDay, hourIn } from "../lib/dates.js";

/**
 * Reminds users whose reminder hour (Nepal time) is now and who haven't checked in
 * today - by push on their devices and by email if it's verified. At most once a day.
 * Returns the number of users reminded.
 */
export async function sendDueReminders(now = new Date()) {
  const today = toDay(now);
  const users = await User.find({
    "preferences.reminders.enabled": true,
    "preferences.reminders.hour": hourIn(now),
    lastReminderDay: { $ne: today },
  });

  let reminded = 0;
  for (const user of users) {
    if (!(await Mood.exists({ userId: user._id, day: today }))) {
      let delivered = false;
      try {
        const pushes = await sendPush(user._id, { ...pushText("reminder.checkin", user.preferences?.language), url: "/" });
        delivered = pushes > 0;
        if (user.emailVerified) {
          await sendReminderEmail(user);
          delivered = true;
        }
      } catch (err) {
        console.error(`Reminder to user ${user._id} failed:`, err.message);
        continue; // try again next run
      }
      if (delivered) reminded += 1;
    }
    user.lastReminderDay = today;
    await user.save();
  }
  return reminded;
}

export function startReminderJob() {
  return cron.schedule(
    "0 * * * *",
    () => sendDueReminders().catch((err) => console.error("Reminder job failed:", err)),
    { timezone: TIMEZONE }
  );
}
