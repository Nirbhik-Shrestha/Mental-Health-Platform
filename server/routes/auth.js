// routes/auth.js
import express from "express";
import { register, login } from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";


const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.user.id).select("_id username");
  res.json({ id: user._id, username: user.username });
});


export default router;
