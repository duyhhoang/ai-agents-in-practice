import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ExecutionRun = {
  id: string;
  timestamp: string;
  triggerType: string;
  status: "Success" | "Failed" | "Running";
  durationMs: number;
  filesProcessed: number;
  error: string | null;
};

const executionsFile = path.join(__dirname, "../../data/ingestion_executions.json");

export function getExecutions(): ExecutionRun[] {
  try {
    if (!fs.existsSync(path.dirname(executionsFile))) {
      fs.mkdirSync(path.dirname(executionsFile), { recursive: true });
    }
    if (!fs.existsSync(executionsFile)) {
      const mockHistory: ExecutionRun[] = [
        {
          id: "exec-9281",
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          triggerType: "Upload Log",
          status: "Success",
          durationMs: 4210,
          filesProcessed: 1,
          error: null
        },
        {
          id: "exec-9282",
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          triggerType: "Manual Trigger",
          status: "Success",
          durationMs: 8900,
          filesProcessed: 10,
          error: null
        },
        {
          id: "exec-9283",
          timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          triggerType: "Upload Audit",
          status: "Failed",
          durationMs: 1420,
          filesProcessed: 0,
          error: "n8n responded with status 503 Service Unavailable"
        }
      ];
      fs.writeFileSync(executionsFile, JSON.stringify(mockHistory, null, 2));
      return mockHistory;
    }
    const content = fs.readFileSync(executionsFile, "utf-8");
    return JSON.parse(content) as ExecutionRun[];
  } catch (err) {
    console.error("Error reading executions file:", err);
    return [];
  }
}

export function logExecution(
  triggerType: string,
  status: "Success" | "Failed" | "Running",
  durationMs: number,
  filesProcessed: number,
  error: string | null = null
): void {
  try {
    const list = getExecutions();
    list.unshift({
      id: "exec-" + crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      triggerType,
      status,
      durationMs,
      filesProcessed,
      error
    });
    fs.writeFileSync(executionsFile, JSON.stringify(list.slice(0, 50), null, 2));
  } catch (err) {
    console.error("Error writing executions file:", err);
  }
}
