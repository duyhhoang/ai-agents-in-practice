import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { getNeo4jDriver } from "../neo4j-client.js";
import { getHash } from "../utils.js";
import { initializeEmbeddings } from "./embedding.js";
import { logDetailedExecution, ExecutionRunFile, ExecutionRun } from "./execution-logger.js";

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

export const pendingExecutions = new Map<string, {
  triggerType: string;
  filename?: string;
  startTime: number;
  tempExecId: string;
  preFileStates: Map<string, { hash: string; processed: boolean }>;
}>();

export async function runIngestionPipeline(triggerType: string, filename?: string): Promise<any> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/trigger-extraction";
  const startTime = Date.now();
  const tempExecId = "exec-" + crypto.randomUUID();

  // 1. Capture pre-file states
  const preFileStates = await getFileStates();

  // Filter if filename is specified
  if (filename) {
    const fileKey = filename.toLowerCase();
    const state = preFileStates.get(fileKey);
    preFileStates.clear();
    if (state) {
      preFileStates.set(fileKey, state);
    }
  }

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
    
    const targetUrl = webhookUrl + (filename ? `?filename=${encodeURIComponent(filename)}` : "");
    let n8nRes = await fetch(targetUrl, { method: "POST" });
    if (!n8nRes.ok && (n8nRes.status === 405 || n8nRes.status === 404)) {
      n8nRes = await fetch(targetUrl, { method: "GET" });
    }

    if (!n8nRes.ok) {
      throw new Error(`n8n webhook responded with status ${n8nRes.status}`);
    }

    const n8nData = await n8nRes.json().catch(() => ({}));
    const executionId = n8nData.executionId || tempExecId;

    // Save running execution context
    pendingExecutions.set(executionId, {
      triggerType,
      filename,
      startTime,
      tempExecId,
      preFileStates
    });
    
    if (executionId !== tempExecId) {
      pendingExecutions.set(tempExecId, {
        triggerType,
        filename,
        startTime,
        tempExecId,
        preFileStates
      });
    }

    updateProgress(filename || "Batch Pipeline", "Extracting supply chain entities (n8n)...", 40, true);

    return {
      success: true,
      executionId,
      status: "Running"
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

export async function completeIngestionPipeline(
  executionId: string,
  status: "success" | "failed",
  errorMsg?: string
): Promise<void> {
  let pending = pendingExecutions.get(executionId);
  
  if (!pending && pendingExecutions.size > 0) {
    const keys = Array.from(pendingExecutions.keys());
    if (keys.length === 1) {
      pending = pendingExecutions.get(keys[0]);
      console.log(`[Ingestion Callback] Mapped n8n execution ID ${executionId} to pending temp ID ${keys[0]}`);
    } else {
      let bestKey = keys[0];
      let minDiff = Infinity;
      const now = Date.now();
      for (const key of keys) {
        const p = pendingExecutions.get(key)!;
        const diff = Math.abs(now - p.startTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestKey = key;
        }
      }
      pending = pendingExecutions.get(bestKey);
      console.log(`[Ingestion Callback] Mapped n8n execution ID ${executionId} to closest pending temp ID ${bestKey}`);
    }
  }

  if (!pending) {
    console.warn(`[Ingestion Callback] No pending execution context found for n8n execution: ${executionId}. Processing generic callback.`);
    
    if (status === "success") {
      updateProgress("External Run", "Generating vector chunk embeddings...", 75, true);
      await initializeEmbeddings();
      updateProgress("External Run", "Ingestion complete!", 100, false);
    } else {
      updateProgress("External Run", `Failed: ${errorMsg || "Unknown error"}`, 0, false);
    }
    return;
  }

  const duration = Date.now() - pending.startTime;
  const { tempExecId, preFileStates, triggerType, filename } = pending;

  try {
    if (status === "success") {
      updateProgress(filename || "Batch Pipeline", "Capturing post-file states...", 65, true);
      const postFileStates = await getFileStates();

      // Compare states to determine status for only targeted files
      const files: ExecutionRunFile[] = Array.from(preFileStates.entries()).map(([name, preState]) => {
        const postState = postFileStates.get(name);
        let fileStatus: "Processed" | "Skipped" | "Failed" = "Skipped";

        if (postState) {
          if (!preState.processed && postState.processed) {
            fileStatus = "Processed";
          } else if (preState.processed) {
            fileStatus = "Skipped";
          } else {
            fileStatus = "Failed";
          }
        } else {
          fileStatus = "Failed";
        }

        return {
          name,
          hash: postState ? postState.hash : preState.hash,
          status: fileStatus
        };
      });

      // Filter files if targeted run
      const filteredFiles = filename 
        ? files.filter(f => f.name.toLowerCase() === filename.toLowerCase())
        : files;

      const processedCount = filteredFiles.filter(f => f.status === "Processed").length;
      const processedFileNames = filteredFiles.filter(f => f.status === "Processed").map(f => f.name);

      if (processedFileNames.length > 0) {
        updateProgress(filename || "Batch Pipeline", "Generating vector chunk embeddings...", 80, true);
        await initializeEmbeddings(processedFileNames);
      } else {
        console.log(`[Ingestion Callback] No files were newly processed. Skipping embedding generation.`);
      }

      // Update Neo4j Execution Log
      await logDetailedExecution({
        id: executionId,
        workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
        timestamp: new Date().toISOString(),
        triggerType,
        status: "Success",
        durationMs: duration,
        filesProcessed: processedCount,
        error: null,
        files: filteredFiles
      }, tempExecId);

      updateProgress(filename || "Batch Pipeline", "Ingestion complete!", 100, false);
      console.log(`[Ingestion Callback] Execution ${executionId} completed successfully in ${(duration / 1000).toFixed(2)}s.`);
    } else {
      // Failed run callback
      const files: ExecutionRunFile[] = Array.from(preFileStates.entries()).map(([name, state]) => ({
        name,
        hash: state.hash,
        status: "Failed" as const,
        error: errorMsg || "n8n workflow failed"
      }));

      await logDetailedExecution({
        id: executionId,
        workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
        timestamp: new Date().toISOString(),
        triggerType,
        status: "Failed",
        durationMs: duration,
        filesProcessed: 0,
        error: errorMsg || "n8n workflow failed",
        files
      }, tempExecId);

      updateProgress(filename || "Batch Pipeline", `Failed: ${errorMsg}`, 0, false);
      console.error(`[Ingestion Callback] Execution ${executionId} failed: ${errorMsg}`);
    }
  } catch (err: any) {
    console.error(`[Ingestion Callback] Error processing callback:`, err);
    updateProgress(filename || "Batch Pipeline", `Callback Error: ${err.message}`, 0, false);
  } finally {
    pendingExecutions.delete(executionId);
    pendingExecutions.delete(tempExecId);
    const keys = Array.from(pendingExecutions.keys());
    for (const key of keys) {
      const p = pendingExecutions.get(key)!;
      if (p.tempExecId === tempExecId || key === tempExecId) {
        pendingExecutions.delete(key);
      }
    }
  }
}
