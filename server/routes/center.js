import express from "express";
import Center from "../models/centerModel.js"

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const centers = await Center.find({});
    res.json(centers);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch centers." });
  }
});


router.get("/:id", async (req, res) => {
  try {
    const center = await Center.findById(req.params.id);
    res.json(center);
  } catch (error) {
    res.status(500).json({ error: "Error fetching center details." });
  }
});

export default router;
