import express from "express";
import { runExport } from "../services/osmosis.service.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await runExport();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
