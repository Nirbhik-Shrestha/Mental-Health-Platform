import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import ForumPost from "../models/ForumPost.js";

const router = express.Router();

// Get all posts
router.get("/", authMiddleware, async (req, res) => {
  const posts = await ForumPost.find().populate("author", "username").sort({ createdAt: -1 });
  res.json({ posts });
});

// Create new post
router.post("/", authMiddleware, async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ message: "Post content is required" });

  const post = await ForumPost.create({ author: req.user.id, content });
  const populatedPost = await post.populate("author", "username");
  res.status(201).json({ post: populatedPost });
});

// Toggle like
router.post("/:id/like", authMiddleware, async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  const userId = req.user.id;
  const liked = post.likes.includes(userId);

  if (liked) {
    post.likes.pull(userId);
  } else {
    post.likes.push(userId);
  }

  await post.save();
  const updatedPost = await ForumPost.findById(post._id).populate("author", "username");
  res.json({ post: updatedPost });
});


// Delete post (only author can delete)
router.delete("/:id", authMiddleware, async (req, res) => {
  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  if (post.author.toString() !== req.user.id) {
    return res.status(403).json({ message: "Unauthorized" });
  }

  await post.remove();
  res.json({ message: "Post deleted" });
});

// Add a comment
router.post("/:id/comments", authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: "Comment text is required" });

  const post = await ForumPost.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });

  post.comments.push({ user: req.user.id, text });
  await post.save();

  const updatedPost = await ForumPost.findById(post._id)
    .populate("author", "username")
    .populate("comments.user", "username");

  res.json({ post: updatedPost });
});



export default router;
