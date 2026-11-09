import express from "express";
import { z } from "zod";
import Blog from "../models/Blog.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { stringList } from "../lib/schemas.js";

const router = express.Router();

const AUTHOR_FIELDS = "username role";
const canEdit = (user, blog) => user.role === "admin" || blog.author?.equals(user._id);

// Public: published articles, newest first.
router.get("/", async (_req, res) => {
  const blogs = await Blog.find({ published: { $ne: false } })
    .populate("author", AUTHOR_FIELDS)
    .sort({ createdAt: -1 });
  res.json({ blogs });
});

// Writers: admins see every article, counselors see their own (including drafts).
router.get("/manage", requireAuth, requireRole("admin", "counselor"), async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { author: req.user._id };
  const blogs = await Blog.find(filter).populate("author", AUTHOR_FIELDS).sort({ updatedAt: -1 });
  res.json({ blogs });
});

router.get("/:id", async (req, res) => {
  const blog = await Blog.findOne({ _id: req.params.id, published: { $ne: false } }).populate(
    "author",
    AUTHOR_FIELDS
  );
  if (!blog) return res.status(404).json({ error: "Article not found" });
  res.json({ blog });
});

const blogSchema = z.object({
  title: z.string().trim().min(3).max(200),
  content: z.string().trim().min(20, "Write at least a few sentences").max(50000),
  tags: stringList(10, 40).default([]),
  published: z.boolean().default(true),
});

router.post("/", requireAuth, requireRole("admin", "counselor"), validate(blogSchema), async (req, res) => {
  const blog = await Blog.create({ ...req.body, author: req.user._id });
  await blog.populate("author", AUTHOR_FIELDS);
  res.status(201).json({ blog });
});

router.put("/:id", requireAuth, requireRole("admin", "counselor"), validate(blogSchema), async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ error: "Article not found" });
  if (!canEdit(req.user, blog)) return res.status(403).json({ error: "You can only edit your own articles" });

  blog.set(req.body);
  await blog.save();
  await blog.populate("author", AUTHOR_FIELDS);
  res.json({ blog });
});

router.delete("/:id", requireAuth, requireRole("admin", "counselor"), async (req, res) => {
  const blog = await Blog.findById(req.params.id);
  if (!blog) return res.status(404).json({ error: "Article not found" });
  if (!canEdit(req.user, blog)) return res.status(403).json({ error: "You can only delete your own articles" });

  await blog.deleteOne();
  res.status(204).end();
});

export default router;
