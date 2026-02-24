import express from "express";
import { runExport } from "../services/osmosis.service.js";

const router = express.Router();

let activeExportProcess = null;

router.get("/stream", async (req, res) => {
  if (activeExportProcess) {
    return res.status(409).json({ error: "An export is already running" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  req.on("close", () => {
    if (activeExportProcess) {
      activeExportProcess.kill();
      activeExportProcess = null;
    }
    res.end();
  });

  try {
    const params = req.query;

    const promise = runExport(params, (message, type) => {
      sendEvent({ type, message });
    });

    activeExportProcess = promise.childProcess;

    const result = await promise;
    sendEvent({ type: "done", result });
  } catch (err) {
    sendEvent({ type: "error", message: err.message });
  } finally {
    activeExportProcess = null;
    res.end();
  }
});

export default router;
