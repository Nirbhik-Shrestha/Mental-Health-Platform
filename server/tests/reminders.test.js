import { describe, it, expect } from "vitest";
import { useTestApp, signUp } from "./helpers.js";
import User from "../models/User.js";
import Mood from "../models/Mood.js";
import { sendDueReminders } from "../jobs/reminders.js";
import { testOutbox } from "../lib/mailer.js";
import { toDay } from "../lib/dates.js";

const app = useTestApp();

// 14:15 UTC = 20:00 in Nepal
const EIGHT_PM_NEPAL = new Date("2025-06-10T14:15:00Z");

const enableReminders = (username, { hour = 20, verified = true } = {}) =>
  User.updateOne(
    { username },
    { emailVerified: verified, "preferences.reminders": { enabled: true, hour } }
  );

describe("daily reminders", () => {
  it("emails verified users at their chosen hour, once a day, unless they've checked in", async () => {
    for (const name of ["due", "checked", "unverified", "later", "off"]) await signUp(app, name);
    testOutbox.length = 0;

    await enableReminders("due");
    await enableReminders("checked");
    await enableReminders("unverified", { verified: false });
    await enableReminders("later", { hour: 21 });
    const checked = await User.findOne({ username: "checked" });
    await Mood.create({ userId: checked._id, mood: "Okay", day: toDay(EIGHT_PM_NEPAL) });

    expect(await sendDueReminders(EIGHT_PM_NEPAL)).toBe(1);
    expect(testOutbox.map((m) => m.to)).toEqual(["due@example.com"]);

    expect(await sendDueReminders(EIGHT_PM_NEPAL)).toBe(0);
  });

  it("writes in the user's language", async () => {
    await signUp(app, "sita", { language: "ne" });
    testOutbox.length = 0;
    await enableReminders("sita");
    await sendDueReminders(EIGHT_PM_NEPAL);
    expect(testOutbox[0].subject).toMatch(/महसुस/);
  });
});
