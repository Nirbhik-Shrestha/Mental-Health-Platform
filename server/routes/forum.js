import express from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import ForumPost from "../models/ForumPost.js";
import analyzeSentiment from "../utils/sentiment.js";

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

  try {
    const sentiment = await analyzeSentiment(content);

    // Check last 3 posts of user
    const lastPosts = await ForumPost.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .limit(3);

    const allNegative = lastPosts.length === 3 && lastPosts.every(post => post.sentiment === "negative");

    const post = await ForumPost.create({
      author: req.user.id,
      content,
      sentiment,
    });

    const populatedPost = await post.populate("author", "username");

    const response = { post: populatedPost };
    if (allNegative) {
      response.warning =
        "Your last 3 posts were strongly negative – consider a breathing session or talking to someone.";
    }

    res.status(201).json(response);
  } catch (err) {
    console.error("Post creation error:", err);
    res.status(500).json({ message: "Failed to create post" });
  }
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
