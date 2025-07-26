import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth.js";
import streakRoutes from './routes/streak.js';
import forumRoutes from './routes/forum.js';
import blogRoutes from "./routes/blog.js";
import moodRoutes from "./routes/mood.js";




dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/streak', streakRoutes);
app.use("/api/auth", authRoutes);
app.use('/api/forum', forumRoutes);
app.use("/api/blogs", blogRoutes);
app.use("/api/mood", moodRoutes);




const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(PORT, () => console.log("Server running on port", PORT)))
  .catch(err => console.error(err));
