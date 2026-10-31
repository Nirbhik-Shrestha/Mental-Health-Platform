import mongoose from "mongoose";

export const REPORT_REASONS = ["harassment", "spam", "self-harm", "misinformation", "other"];

const commentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  text: { type: String, required: true },
  anonymous: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const reportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const forumPostSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    anonymous: { type: Boolean, default: false },
    content: { type: String, required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    comments: [commentSchema],
    sentiment: { type: String, enum: ["positive", "neutral", "negative"], default: "neutral" },

    // Moderation
    riskFlag: { type: Boolean, default: false },
    reports: [reportSchema],
    status: { type: String, enum: ["visible", "hidden"], default: "visible" },
    needsReview: { type: Boolean, default: false },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    // Private outreach to the writer after a risk flag.
    followUp: {
      contactedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      contactedAt: { type: Date },
    },
  },
  { timestamps: true }
);

forumPostSchema.index({ createdAt: -1 });
forumPostSchema.index({ needsReview: 1 });

export default mongoose.model("ForumPost", forumPostSchema);
