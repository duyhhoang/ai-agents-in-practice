import { Router } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";
import { getHash } from "../utils.js";
import { getExecutions, logExecution } from "../services/execution-logger.js";
import { initializeEmbeddings } from "../services/embedding.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

type ProgressState = {
  active: boolean;
  fileName: string | null;
  step: string;
  percent: number;
  updatedAt: string;
};

let activeProgress: ProgressState = {
  active: false,
  fileName: null,
  step: "Idle",
  percent: 0,
  updatedAt: new Date().toISOString()
};

export function updateProgress(fileName: string | null, step: string, percent: number, active = true) {
  activeProgress = {
    active,
    fileName,
    step,
    percent: Math.min(100, Math.max(0, percent)),
    updatedAt: new Date().toISOString()
  };
}

router.get("/ingestion/progress", (req, res) => {
  const ageMs = Date.now() - new Date(activeProgress.updatedAt).getTime();
  if (ageMs > 30000 && activeProgress.active) {
    activeProgress.active = false;
  }
  res.json(activeProgress);
});

router.post("/ingestion/progress", (req, res) => {
  const { fileName, step, percent, active } = req.body;
  updateProgress(fileName || null, step || "Processing...", Number(percent) || 0, active !== false);
  res.json({ success: true, progress: activeProgress });
});

router.get("/ingestion/executions", (req, res) => {
  try {
    const cmd = `docker exec n8n-compose node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/home/node/.n8n/database.sqlite'); const rows = db.prepare('SELECT e.id, e.workflowId, w.name AS workflowName, e.status, e.mode AS triggerType, e.startedAt, e.stoppedAt FROM execution_entity e LEFT JOIN workflow_entity w ON e.workflowId = w.id ORDER BY e.id DESC LIMIT 50').all(); console.log(JSON.stringify(rows));"`;
    const stdout = execSync(cmd, { timeout: 4000, encoding: "utf-8" });
    const rawList = JSON.parse(stdout.trim());

    const formatted = rawList.map((row: any) => {
      const startTime = row.startedAt ? new Date(row.startedAt).getTime() : Date.now();
      const stopTime = row.stoppedAt ? new Date(row.stoppedAt).getTime() : startTime;
      const durationMs = Math.max(0, stopTime - startTime);

      const statusMap: Record<string, "Success" | "Failed"> = {
        success: "Success",
        error: "Failed",
        crashed: "Failed",
      };

      const triggerSource = row.workflowName
        ? `${row.workflowName} (${row.triggerType})`
        : `n8n (${row.triggerType})`;

      return {
        id: String(row.id),
        timestamp: row.startedAt ? new Date(row.startedAt).toISOString() : new Date().toISOString(),
        triggerType: triggerSource,
        status: statusMap[row.status] || (row.status === "running" ? "Running" : "Failed"),
        durationMs,
        filesProcessed: 1,
        error: row.status === "error" || row.status === "crashed" ? `n8n execution ${row.id} status: ${row.status}` : null
      };
    });

    res.json(formatted);
  } catch (err: any) {
    console.warn("Failed to query n8n execution database via docker exec, using fallback:", err.message);
    res.json(getExecutions());
  }
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

  const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
  const startTime = Date.now();

  try {
    console.log(`[Upload] Triggering n8n pipeline: ${webhookUrl}`);
    updateProgress(filename, "Triggering n8n pipeline...", 15, true);
    let n8nRes = await fetch(webhookUrl, { method: "POST" });
    if (!n8nRes.ok && n8nRes.status === 405) {
      n8nRes = await fetch(webhookUrl, { method: "GET" });
    }
    const duration = Date.now() - startTime;

    if (!n8nRes.ok) {
      throw new Error(`n8n webhook responded with status ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json().catch(() => ({}));
    console.log(`[Upload] Ingestion completed in ${duration}ms:`, n8nData);

    updateProgress(filename, "Generating vector chunk embeddings...", 75, true);
    await initializeEmbeddings();

    const filesCount = Array.isArray(n8nData) ? n8nData.length : 1;
    logExecution(`Upload Log (${filename})`, "Success", duration, filesCount);
    updateProgress(filename, "Ingestion complete!", 100, false);

    const answer = `File **${filename}** uploaded and ingested successfully!\n\n**Ingestion Report:**\n- Pipeline Duration: ${(duration / 1000).toFixed(2)}s\n- Status: Ingestion complete\n- Files processed in batch: ${filesCount}`;

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
            durationMs: duration,
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
    const duration = Date.now() - startTime;
    console.error(`[Upload Error]`, err.message);
    logExecution(`Upload Log (${filename})`, "Failed", duration, 0, err.message);
    updateProgress(filename, `Failed: ${err.message}`, 0, false);
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
  updateProgress("Batch Pipeline", "Triggering n8n pipeline...", 10, true);
  const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
  const startTime = Date.now();
  try {
    let n8nRes = await fetch(webhookUrl, { method: "POST" });
    if (!n8nRes.ok && n8nRes.status === 405) {
      n8nRes = await fetch(webhookUrl, { method: "GET" });
    }
    const duration = Date.now() - startTime;
    if (n8nRes.ok) {
      const data = await n8nRes.json().catch(() => ({}));
      const filesCount = Array.isArray(data) ? data.length : 1;
      logExecution("Manual Trigger", "Success", duration, filesCount);
      updateProgress("Batch Pipeline", "Pipeline finished!", 100, false);
      res.json({
        success: true,
        duration_ms: duration,
        processed_files: filesCount,
        details: data
      });
    } else {
      throw new Error(`n8n responded with status ${n8nRes.status}`);
    }
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logExecution("Manual Trigger", "Failed", duration, 0, err.message);
    updateProgress("Batch Pipeline", `Failed: ${err.message}`, 0, false);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    isPipelineRunning = false;
  }
});

export default router;
