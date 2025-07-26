import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  password: { type: String, required: true },
  email: { type: String, required: true },
  contact: { type: String, required: true },
  address: { type: String },
  dob: { type: Date },
  streak: {
    type: Number,
    default: 1,
  },
  lastActiveDate: {
    type: Date,
    default: () =>
      new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kathmandu" })),
  },
  // Example in Mongoose (user.model.js)
moodHistory: [
  {
    mood: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  }
]

});

export default mongoose.model("User", userSchema);
