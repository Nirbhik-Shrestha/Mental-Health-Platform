import mongoose from "mongoose";

// The whole plan is stored as one encrypted JSON document (see routes/safetyPlan.js).
const safetyPlanSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    data: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("SafetyPlan", safetyPlanSchema);
