import express from "express";
import { z } from "zod";
import ForumPost, { REPORT_REASONS } from "../models/ForumPost.js";
import { requireAuth } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { analyzeSentiment, detectRiskLanguage } from "../lib/sentiment.js";
import { serializePost, POPULATE_POST } from "../lib/forum.js";
import { supportSignals } from "../lib/support.js";
import { audit } from "../lib/audit.js";
import { notify, adminIds } from "../lib/notify.js";
import { sendModerationAlertEmail } from "../lib/emails.js";
import User from "../models/User.js";

/** Tells every admin right away that a post needs review (in-app, push, and email). */
async function alertModerators() {
  try {
    const ids = await adminIds();
    await notify(ids, { type: "moderation.alert", link: "/admin/moderation" });
    const admins = await User.find({ _id: { $in: ids }, emailVerified: true });
    await Promise.all(admins.map((admin) => sendModerationAlertEmail(admin)));
  } catch (err) {
    console.error("Moderator alert failed:", err.message);
  }
}

const router = express.Router();
router.use(requireAuth);

const PAGE_SIZE = 20;
// Older posts predate the status field, so match "not hidden" rather than "visible".
const VISIBLE = { status: { $ne: "hidden" } };

const findVisiblePost = (id) => ForumPost.findOne({ _id: id, ...VISIBLE });

const respondWithPost = async (res, post, viewer, extra = {}) => {
  await post.populate(POPULATE_POST);
  res.json({ post: serializePost(post, viewer), ...extra });
};

/** Support prompt for the writer: risk language now, or a run of negative posts/moods. */
async function supportFor(userId, risky) {
  if (risky) return { needsSupport: true, reasons: ["risk"] };
  const signals = await supportSignals(userId);
  return signals.needsSupport ? signals : undefined;
}

router.get(
  "/",
  validate(z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) }), "query"),
  async (req, res) => {
    const { page } = req.validQuery;
    const posts = await ForumPost.find(VISIBLE)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .populate(POPULATE_POST);

    res.json({
      posts: posts.slice(0, PAGE_SIZE).map((post) => serializePost(post, req.user)),
      page,
      hasMore: posts.length > PAGE_SIZE,
    });
  }
);

const postSchema = z.object({
  content: z.string().trim().min(1, "Write something first").max(5000),
  anonymous: z.boolean().default(false),
});

router.post("/", validate(postSchema), async (req, res) => {
  const { content, anonymous } = req.body;
  const risky = detectRiskLanguage(content);

  const post = await ForumPost.create({
    author: req.user._id,
    content,
    anonymous,
    sentiment: analyzeSentiment(content),
    riskFlag: risky,
    needsReview: risky,
  });

  if (risky) await alertModerators();
  const support = await supportFor(req.user._id, risky);
  res.status(201);
  await respondWithPost(res, post, req.user, support ? { support } : {});
});

router.post("/:id/like", async (req, res) => {
  const post = await findVisiblePost(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const userId = req.user._id;
  if (post.likes.some((id) => id.equals(userId))) post.likes.pull(userId);
  else post.likes.push(userId);
  await post.save();

  await respondWithPost(res, post, req.user);
});

router.delete("/:id", async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });
  if (!post.author.equals(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ error: "You can only delete your own posts" });
  }
  await post.deleteOne();
  if (!post.author.equals(req.user._id)) await audit(req, "post.delete", { targetType: "post", targetId: post._id });
  res.status(204).end();
});

const commentSchema = z.object({
  text: z.string().trim().min(1, "Write something first").max(1000),
  anonymous: z.boolean().default(false),
});

router.post("/:id/comments", validate(commentSchema), async (req, res) => {
  const post = await findVisiblePost(req.params.id);
  if (!post) return res.status(404).json({ error: "Post not found" });

  const { text, anonymous } = req.body;
  const risky = detectRiskLanguage(text);
  post.comments.push({ user: req.user._id, text, anonymous });
  if (risky) {
    post.riskFlag = true;
    post.needsReview = true;
  }
  await post.save();
  if (risky) await alertModerators();

  res.status(201);
  await respondWithPost(res, post, req.user, risky ? { support: { needsSupport: true, reasons: ["risk"] } } : {});
});

router.delete("/:id/comments/:commentId", async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  const comment = post?.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ error: "Comment not found" });
  if (!comment.user?.equals(req.user._id) && req.user.role !== "admin") {
    return res.status(403).json({ error: "You can only delete your own comments" });
  }
  comment.deleteOne();
  await post.save();
  await respondWithPost(res, post, req.user);
});

router.post(
  "/:id/report",
  validate(z.object({ reason: z.enum(REPORT_REASONS) })),
  async (req, res) => {
    const post = await findVisiblePost(req.params.id);
    if (!post) return res.status(404).json({ error: "Post not found" });

    // One report per user; reporting again updates the reason.
    post.reports = post.reports.filter((report) => !report.user.equals(req.user._id));
    post.reports.push({ user: req.user._id, reason: req.body.reason });
    post.needsReview = true;
    await post.save();

    await respondWithPost(res, post, req.user);
  }
);

export default router;
