import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import streakRoutes from './routes/streak.js';
import forumRoutes from './routes/forum.js';
import blogRoutes from "./routes/blog.js";
import moodRoutes from "./routes/mood.js";
import userRoutes from "./routes/user.js";
import adminRoutes from "./routes/admin.js";
import centerRoutes from "./routes/center.js";



dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/streak', streakRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/forum', forumRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/mood", moodRoutes);
app.use("/api/me", userRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/centers", centerRoutes);




const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log("Server running on port", PORT)))
  .catch(err => console.error(err));
