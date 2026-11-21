// Upgrades data created by earlier versions of the app.
// Usage: npm run migrate            (apply)
//        npm run migrate -- --dry-run (report only)
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { toDay } from "../lib/dates.js";
import { MOODS } from "../lib/moods.js";
import User from "../models/User.js";
import Mood from "../models/Mood.js";
import ForumPost from "../models/ForumPost.js";
import Blog from "../models/Blog.js";
import Center from "../models/centerModel.js";
import JournalEntry from "../models/JournalEntry.js";
import SafetyPlan from "../models/SafetyPlan.js";

const dryRun = process.argv.includes("--dry-run");
const log = (message) => console.log(`${dryRun ? "[dry run] " : ""}${message}`);

await mongoose.connect(env.mongoUri);
const db = mongoose.connection.db;
const moods = db.collection("moods");
const users = db.collection("users");
const posts = db.collection("forumposts");

// 1. Moods: add the Nepal-time `day`, then keep only the latest check-in per user per day.
const allMoods = await moods.find({}, { projection: { userId: 1, day: 1, timestamp: 1 } }).toArray();
const withoutDay = allMoods.filter((mood) => !mood.day);
for (const mood of withoutDay) mood.day = toDay(mood.timestamp ?? mood._id.getTimestamp());
log(`Moods missing a day: ${withoutDay.length}`);
if (!dryRun) {
  for (const mood of withoutDay) await moods.updateOne({ _id: mood._id }, { $set: { day: mood.day } });
}

// Grouped in memory so a dry run sees the same days a real run would write.
const latestFirst = [...allMoods].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
const kept = new Set();
const extraIds = [];
for (const mood of latestFirst) {
  const key = `${mood.userId}:${mood.day}`;
  if (kept.has(key)) extraIds.push(mood._id);
  else kept.add(key);
}
log(`Duplicate same-day moods to remove (keeping the latest): ${extraIds.length}`);
if (!dryRun && extraIds.length) await moods.deleteMany({ _id: { $in: extraIds } });

const unknownMoods = await moods.countDocuments({ mood: { $nin: MOODS } });
if (unknownMoods) log(`WARNING: ${unknownMoods} moods have values outside ${MOODS.join(", ")} - review manually`);

// 2. Users: lowercase emails, drop fields replaced by the Mood collection.
const allUsers = await users.find({}, { projection: { username: 1, email: 1 } }).toArray();
const seen = { username: new Map(), email: new Map() };
for (const user of allUsers) {
  for (const field of ["username", "email"]) {
    const key = field === "email" ? user.email?.toLowerCase().trim() : user.username;
    if (seen[field].has(key)) {
      log(`WARNING: duplicate ${field} "${key}" (users ${seen[field].get(key)} and ${user._id}) - resolve before indexes can be built`);
    }
    seen[field].set(key, user._id);
  }
  if (!dryRun && user.email && user.email !== user.email.toLowerCase().trim()) {
    await users.updateOne({ _id: user._id }, { $set: { email: user.email.toLowerCase().trim() } });
  }
}
const legacyFields = { streak: "", lastActiveDate: "", moodHistory: "" };
const legacyCount = await users.countDocuments({ $or: Object.keys(legacyFields).map((f) => ({ [f]: { $exists: true } })) });
log(`Users with legacy streak/moodHistory fields: ${legacyCount}`);
if (!dryRun) await users.updateMany({}, { $unset: legacyFields });

// 3. Forum posts: fill moderation defaults and fix empty sentiment from the old Python analyser.
const badSentiment = await posts.countDocuments({ sentiment: { $nin: ["positive", "neutral", "negative"] } });
log(`Posts with missing/invalid sentiment: ${badSentiment}`);
if (!dryRun) {
  await posts.updateMany({ sentiment: { $nin: ["positive", "neutral", "negative"] } }, { $set: { sentiment: "neutral" } });
  await posts.updateMany({ status: { $exists: false } }, { $set: { status: "visible" } });
  await posts.updateMany({ needsReview: { $exists: false } }, { $set: { needsReview: false } });
}

// 4. Indexes (unique username/email, one mood per user per day, ...).
if (!dryRun) {
  for (const model of [User, Mood, ForumPost, Blog, Center, JournalEntry, SafetyPlan]) {
    try {
      await model.syncIndexes();
    } catch (err) {
      log(`WARNING: could not build indexes for ${model.modelName}: ${err.message}`);
    }
  }
  log("Indexes synced");
}

log("The old `streaks` collection is no longer used; drop it once you're happy with the migration.");
await mongoose.disconnect();
