import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";
import { getHash } from "../utils.js";
import { initializeEmbeddings } from "./embedding.js";
import { logDetailedExecution, ExecutionRunFile } from "./execution-logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "../../data-processors");

export type ProgressState = {
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

export function getActiveProgress(): ProgressState {
  return activeProgress;
}

export function updateProgress(fileName: string | null, step: string, percent: number, active = true) {
  activeProgress = {
    active,
    fileName,
    step,
    percent: Math.min(100, Math.max(0, percent)),
    updatedAt: new Date().toISOString()
  };
}

export async function getFileStates(): Promise<Map<string, { hash: string; processed: boolean }>> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  const fileStates = new Map<string, { hash: string; processed: boolean }>();
  try {
    const dbRes = await session.run("MATCH (f:ProcessedFile) RETURN f.name AS name, f.hash AS hash");
    const processedMap = new Map<string, string>();
    dbRes.records.forEach((r) => {
      const name = r.get("name");
      const hash = r.get("hash");
      if (name) processedMap.set(name.toLowerCase(), hash || "");
    });

    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      for (const file of files) {
        if (!/\.(csv|txt|md|json)$/i.test(file)) continue;
        const filePath = path.join(uploadDir, file);
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) continue;
        const text = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
        const hash = getHash(text);
        const processed = processedMap.has(file.toLowerCase()) && processedMap.get(file.toLowerCase()) === hash;
        fileStates.set(file.toLowerCase(), { hash, processed });
      }
    }
  } catch (err) {
    console.error("Error getting file states:", err);
  } finally {
    await session.close();
  }
  return fileStates;
}

export async function runIngestionPipeline(triggerType: string, filename?: string): Promise<any> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
  const startTime = Date.now();
  const tempExecId = "exec-" + crypto.randomUUID();

  // 1. Capture pre-file states
  const preFileStates = await getFileStates();

  // 2. Log temporary "Running" execution
  await logDetailedExecution({
    id: tempExecId,
    workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
    timestamp: new Date().toISOString(),
    triggerType,
    status: "Running",
    durationMs: 0,
    filesProcessed: 0,
    error: null,
    files: Array.from(preFileStates.entries()).map(([name, state]) => ({
      name,
      hash: state.hash,
      status: "Skipped" as const
    }))
  });

  try {
    // 3. Trigger webhook
    updateProgress(filename || "Batch Pipeline", "Triggering n8n pipeline...", 15, true);
    let n8nRes = await fetch(webhookUrl, { method: "POST" });
    if (!n8nRes.ok && (n8nRes.status === 405 || n8nRes.status === 404)) {
      n8nRes = await fetch(webhookUrl, { method: "GET" });
    }

    const duration = Date.now() - startTime;
    if (!n8nRes.ok) {
      throw new Error(`n8n webhook responded with status ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json().catch(() => ({}));
    const executionId = n8nData.executionId || tempExecId;

    // 4. Refresh embeddings
    updateProgress(filename || "Batch Pipeline", "Generating vector chunk embeddings...", 75, true);
    await initializeEmbeddings();

    // 5. Capture post-file states
    const postFileStates = await getFileStates();

    // 6. Compare file states to determine Processed vs Skipped vs Failed
    const files: ExecutionRunFile[] = Array.from(postFileStates.entries()).map(([name, postState]) => {
      const preState = preFileStates.get(name);
      let status: "Processed" | "Skipped" | "Failed" = "Skipped";

      if (!preState || !preState.processed) {
        if (postState.processed) {
          status = "Processed";
        } else {
          status = "Failed";
        }
      } else {
        status = "Skipped";
      }

      return {
        name,
        hash: postState.hash,
        status
      };
    });

    const processedCount = files.filter(f => f.status === "Processed").length;

    // 7. Update execution log to Success
    await logDetailedExecution({
      id: executionId,
      workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
      timestamp: new Date().toISOString(),
      triggerType,
      status: "Success",
      durationMs: duration,
      filesProcessed: processedCount,
      error: null,
      files
    }, tempExecId);

    updateProgress(filename || "Batch Pipeline", "Ingestion complete!", 100, false);

    return {
      success: true,
      executionId,
      durationMs: duration,
      filesProcessed: processedCount,
      files,
      details: n8nData
    };

  } catch (err: any) {
    const duration = Date.now() - startTime;
    // Log execution as Failed
    await logDetailedExecution({
      id: tempExecId,
      workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
      timestamp: new Date().toISOString(),
      triggerType,
      status: "Failed",
      durationMs: duration,
      filesProcessed: 0,
      error: err.message,
      files: Array.from(preFileStates.entries()).map(([name, state]) => ({
        name,
        hash: state.hash,
        status: "Failed" as const,
        error: err.message
      }))
    }, tempExecId);

    updateProgress(filename || "Batch Pipeline", `Failed: ${err.message}`, 0, false);
    throw err;
  }
}
