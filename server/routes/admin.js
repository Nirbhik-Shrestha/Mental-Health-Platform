import express from "express";
import { z } from "zod";
import User, { ROLES } from "../models/User.js";
import Mood from "../models/Mood.js";
import ForumPost from "../models/ForumPost.js";
import JournalEntry from "../models/JournalEntry.js";
import { requireAuth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/admin.js";
import { validate } from "../middleware/validate.js";
import { deleteUserAndData } from "../lib/accounts.js";
import { toDay, addDays } from "../lib/dates.js";
import { MOOD_SCORES } from "../lib/moods.js";
import { audit } from "../lib/audit.js";
import AuditLog from "../models/AuditLog.js";
import { notify } from "../lib/notify.js";
import CenterFeedback from "../models/CenterFeedback.js";
import { runLinkCheck } from "../jobs/linkCheck.js";
import { sendOutreachEmail } from "../lib/emails.js";

const router = express.Router();
router.use(requireAuth, requireAdmin);

const DAY_MS = 24 * 60 * 60 * 1000;
// Daily mood averages built from fewer people than this are withheld, so
// aggregates can't be traced back to individuals.
export const MIN_GROUP_SIZE = 3;

router.get("/users", async (_req, res) => {
  const [users, lastCheckIns] = await Promise.all([
    User.find().sort({ createdAt: -1 }),
    Mood.aggregate([{ $group: { _id: "$userId", lastDay: { $max: "$day" }, checkIns: { $sum: 1 } } }]),
  ]);
  const activity = new Map(lastCheckIns.map((row) => [row._id.toString(), row]));

  res.json({
    users: users.map((user) => {
      const row = activity.get(user._id.toString());
      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        lastCheckIn: row?.lastDay ?? null,
        checkIns: row?.checkIns ?? 0,
      };
    }),
  });
});

router.patch("/users/:id/role", validate(z.object({ role: z.enum(ROLES) })), async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ error: "You can't change your own role" });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true });
  if (!user) return res.status(404).json({ error: "User not found" });
  await audit(req, "user.role", { targetType: "user", targetId: user._id, details: { username: user.username, role: user.role } });
  res.json({ user: { _id: user._id, username: user.username, role: user.role } });
});

router.delete("/users/:id", async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    return res.status(400).json({ error: "You can't delete your own account from here" });
  }
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "User not found" });
  await deleteUserAndData(req.params.id);
  await audit(req, "user.delete", { targetType: "user", targetId: target._id, details: { username: target.username } });
  res.status(204).end();
});

// Posts flagged for risk language or reported by users, awaiting review.
router.get("/moderation", async (_req, res) => {
  const posts = await ForumPost.find({ needsReview: true })
    .sort({ riskFlag: -1, updatedAt: -1 })
    .populate("author", "username email")
    .populate("comments.user", "username")
    .populate("reports.user", "username")
    .populate("followUp.contactedBy", "username");
  res.json({ posts });
});

// Private, supportive message to the writer of a flagged post (in-app, push, email).
router.post(
  "/moderation/:id/reach-out",
  validate(z.object({ note: z.string().trim().max(1000).optional() })),
  async (req, res) => {
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });
    const author = await User.findById(post.author);
    if (!author) return res.status(404).json({ error: "The writer's account no longer exists" });

    const note = req.body.note || undefined;
    await notify(author._id, { type: "moderation.outreach", data: note ? { note } : {}, link: "/notifications" });
    if (author.emailVerified) await sendOutreachEmail(author, note);

    post.followUp = { contactedBy: req.user._id, contactedAt: new Date() };
    await post.save();
    await audit(req, "post.reach-out", { targetType: "post", targetId: post._id });
    res.json({ followUp: { contactedBy: { _id: req.user._id, username: req.user.username }, contactedAt: post.followUp.contactedAt } });
  }
);

router.patch(
  "/moderation/:id",
  validate(z.object({ action: z.enum(["hide", "restore", "dismiss"]) })),
  async (req, res) => {
    const post = await ForumPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (req.body.action === "hide") post.status = "hidden";
    if (req.body.action === "restore") post.status = "visible";
    post.needsReview = false;
    post.reviewedBy = req.user._id;
    post.reviewedAt = new Date();
    await post.save();
    await audit(req, `post.${req.body.action}`, { targetType: "post", targetId: post._id });
    res.json({ post: { _id: post._id, status: post.status, needsReview: post.needsReview } });
  }
);

// Aggregate, anonymised usage figures.
router.get("/analytics", async (_req, res) => {
  const today = toDay();
  const since30Day = addDays(today, -29);
  const since7Day = addDays(today, -6);
  const since30 = new Date(Date.now() - 30 * DAY_MS);
  const since7 = new Date(Date.now() - 7 * DAY_MS);

  const [
    totalUsers,
    newUsers,
    activeMoodUsers,
    activePostUsers,
    moodDistribution,
    dailyMoods,
    totalPosts,
    recentPosts,
    sentiment,
    pendingReview,
    journalEntries,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since30 } }),
    Mood.distinct("userId", { day: { $gte: since7Day } }),
    ForumPost.distinct("author", { createdAt: { $gte: since7 } }),
    Mood.aggregate([{ $match: { day: { $gte: since30Day } } }, { $group: { _id: "$mood", count: { $sum: 1 } } }]),
    Mood.aggregate([
      { $match: { day: { $gte: since30Day } } },
      { $group: { _id: { day: "$day", mood: "$mood" }, count: { $sum: 1 } } },
    ]),
    ForumPost.countDocuments(),
    ForumPost.countDocuments({ createdAt: { $gte: since30 } }),
    ForumPost.aggregate([
      { $match: { createdAt: { $gte: since30 } } },
      { $group: { _id: "$sentiment", count: { $sum: 1 } } },
    ]),
    ForumPost.countDocuments({ needsReview: true }),
    JournalEntry.countDocuments(),
  ]);

  const activeUsers = new Set([...activeMoodUsers, ...activePostUsers].map(String)).size;

  // Average mood per day (1-5), withheld for small groups.
  const byDay = {};
  for (const { _id, count } of dailyMoods) {
    byDay[_id.day] ??= { sum: 0, count: 0 };
    byDay[_id.day].sum += MOOD_SCORES[_id.mood] * count;
    byDay[_id.day].count += count;
  }
  const moodTrend = [];
  for (let day = since30Day; day <= today; day = addDays(day, 1)) {
    const entry = byDay[day];
    moodTrend.push({
      day,
      checkIns: entry?.count ?? 0,
      average: entry && entry.count >= MIN_GROUP_SIZE ? Math.round((entry.sum / entry.count) * 100) / 100 : null,
    });
  }

  const toCounts = (rows) => Object.fromEntries(rows.map(({ _id, count }) => [_id, count]));

  res.json({
    users: { total: totalUsers, newLast30Days: newUsers, activeLast7Days: activeUsers },
    moods: { distributionLast30Days: toCounts(moodDistribution), trend: moodTrend, minGroupSize: MIN_GROUP_SIZE },
    forum: {
      totalPosts,
      postsLast30Days: recentPosts,
      sentimentLast30Days: toCounts(sentiment),
      pendingReview,
    },
    journal: { totalEntries: journalEntries },
  });
});

// Directory reports and suggestions
router.get("/center-feedback", async (_req, res) => {
  const items = await CenterFeedback.find({ status: "open" })
    .sort({ createdAt: -1 })
    .populate("center", "name")
    .populate("submittedBy", "username");
  res.json({ items });
});

router.post("/center-feedback/:id/resolve", async (req, res) => {
  const item = await CenterFeedback.findByIdAndUpdate(
    req.params.id,
    { status: "resolved", resolvedBy: req.user._id },
    { new: true }
  );
  if (!item) return res.status(404).json({ error: "Not found" });
  await audit(req, "center-feedback.resolve", { targetType: "center-feedback", targetId: item._id, details: { kind: item.kind } });
  res.status(204).end();
});

// Check every resource link and center website now.
router.post("/link-check", async (req, res) => {
  const result = await runLinkCheck();
  await audit(req, "links.check", { details: { checked: result.checked, broken: result.broken.length } });
  res.json(result);
});

// Recent admin actions, newest first.
router.get("/audit", async (_req, res) => {
  const entries = await AuditLog.find().sort({ createdAt: -1 }).limit(200).lean();
  res.json({ entries });
});

export default router;
