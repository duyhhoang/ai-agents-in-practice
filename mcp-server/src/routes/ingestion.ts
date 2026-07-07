import express, { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";
import { getHash } from "../utils.js";
import { getExecutions, logExecution } from "../services/execution-logger.js";
import { 
  getActiveProgress, 
  updateProgress, 
  runIngestionPipeline, 
  getFileStates 
} from "../services/ingestion-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Serve uploaded files statically
router.use("/ingestion/files", express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

router.get("/ingestion/progress", (req, res) => {
  const activeProgress = getActiveProgress();
  const ageMs = Date.now() - new Date(activeProgress.updatedAt).getTime();
  if (ageMs > 30000 && activeProgress.active) {
    updateProgress(activeProgress.fileName, activeProgress.step, activeProgress.percent, false);
  }
  res.json(getActiveProgress());
});

router.post("/ingestion/progress", (req, res) => {
  const { fileName, step, percent, active } = req.body;
  updateProgress(fileName || null, step || "Processing...", Number(percent) || 0, active !== false);
  res.json({ success: true, progress: getActiveProgress() });
});

router.post("/ingestion/failure", async (req, res) => {
  const { workflowName, executionId, error } = req.body;
  const errorMsg = error || "n8n pipeline execution failed";
  const source = workflowName ? `n8n Error Trigger (${workflowName})` : "n8n Error Trigger";

  console.error(`[n8n Pipeline Failure Notification] Execution: ${executionId || "N/A"}, Workflow: ${workflowName || "Data Ingestion"}, Error: ${errorMsg}`);
  
  await logExecution(source, "Failed", 0, 0, errorMsg);
  updateProgress(null, `Error Trigger: ${errorMsg}`, 0, false);

  res.json({ success: true, message: "Failure notification logged" });
});

router.get("/ingestion/executions", async (req, res) => {
  res.json(await getExecutions());
});

router.get("/ingestion/status", async (req, res) => {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const dbRes = await session.run("MATCH (f:ProcessedFile) RETURN f.name AS name, f.hash AS hash");
    const processedMap = new Map<string, string>();
    const processedHashes = new Set<string>();
    dbRes.records.forEach(r => {
      const name = r.get("name");
      const hash = r.get("hash");
      if (name) {
        processedMap.set(name.toLowerCase(), hash || "");
      }
      if (hash) {
        processedHashes.add(hash);
      }
    });

    if (!fs.existsSync(uploadDir)) {
      return res.json([]);
    }
    const files = fs.readdirSync(uploadDir);
    const resultList = [];

    for (const file of files) {
      if (!/\.(csv|txt|md|json)$/i.test(file)) continue;
      const filePath = path.join(uploadDir, file);
      const stats = fs.statSync(filePath);
      if (!stats.isFile()) continue;

      const text = fs.readFileSync(filePath, "utf-8");
      const hash = getHash(text);
      const processed = processedMap.has(file.toLowerCase()) || processedHashes.has(hash);

      resultList.push({
        name: file,
        size: stats.size,
        hash,
        processed
      });
    }
    res.json(resultList);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

router.post(["/upload", "/api/upload", "/api/ingestion/upload"], upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded." });
  }

  const filename = req.file.originalname;
  console.log(`[Upload] File saved: ${filename}`);

  try {
    const result = await runIngestionPipeline(`Upload Log (${filename})`, filename);
    const answer = `File **${filename}** uploaded and ingested successfully!\n\n**Ingestion Report:**\n- Pipeline Duration: ${(result.durationMs / 1000).toFixed(2)}s\n- Status: Ingestion complete\n- Files processed: ${result.filesProcessed}`;

    res.json({
      messageId: crypto.randomUUID(),
      answer,
      evidenceGraph: { nodes: [], edges: [] },
      evidenceTrace: {
        toolsUsed: [
          {
            id: "n8n_ingestion",
            name: "n8n pipeline trigger",
            status: "success",
            durationMs: result.durationMs,
            inputSummary: `Filename: ${filename}`,
            outputSummary: `Processed successfully`
          }
        ],
        cypherQueries: [],
        accessedNodes: [],
        sourceChunks: []
      }
    });
  } catch (err: any) {
    console.error(`[Upload Error]`, err.message);
    res.status(500).json({
      error: "Upload & Ingestion failed",
      details: err.message
    });
  }
});

let isPipelineRunning = false;

router.post("/ingestion/trigger", async (req, res) => {
  if (isPipelineRunning) {
    return res.status(429).json({ success: false, error: "The n8n ingestion pipeline is already running. Please wait for it to complete." });
  }
  isPipelineRunning = true;
  try {
    const result = await runIngestionPipeline("Manual Trigger");
    res.json({
      success: true,
      duration_ms: result.durationMs,
      processed_files: result.filesProcessed,
      details: result.details
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  } finally {
    isPipelineRunning = false;
  }
});

export default router;
