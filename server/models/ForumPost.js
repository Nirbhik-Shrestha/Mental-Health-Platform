import mongoose from "mongoose";

const forumPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  content: { type: String, required: true },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  sentiment: {
  type: String,
  enum: ["positive", "neutral", "negative"],
  default: "neutral",
}

}, { timestamps: true });


export default mongoose.model("ForumPost", forumPostSchema);
