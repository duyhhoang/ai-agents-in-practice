import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type ExecutionRunFile = {
  name: string;
  hash: string;
  status: "Processed" | "Skipped" | "Failed";
  error?: string;
};

export type ExecutionRun = {
  id: string;
  workflowName?: string;
  timestamp: string;
  triggerType: string;
  status: "Success" | "Failed" | "Running";
  durationMs: number;
  filesProcessed: number;
  error: string | null;
  files?: ExecutionRunFile[];
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
          workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
          timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          triggerType: "Upload Log (energy_consumption.csv)",
          status: "Success",
          durationMs: 4210,
          filesProcessed: 1,
          error: null,
          files: [
            {
              name: "energy_consumption.csv",
              hash: "d41d8cd98f00b204e9800998ecf8427e",
              status: "Processed"
            }
          ]
        },
        {
          id: "exec-9282",
          workflowName: "07_LLM_Entity_Extraction_v3_HTTP",
          timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          triggerType: "Manual Trigger",
          status: "Success",
          durationMs: 8900,
          filesProcessed: 2,
          error: null,
          files: [
            {
              name: "transport_routes.csv",
              hash: "e2c5625b138e6e5898d28c3a1f8427e9",
              status: "Processed"
            },
            {
              name: "incident_report_vde_01.txt",
              hash: "f3c5625b138e6e5898d28c3a1f8427e0",
              status: "Skipped"
            }
          ]
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

export function logDetailedExecution(run: ExecutionRun, oldId?: string): void {
  try {
    const list = getExecutions();
    let filtered = list;
    if (oldId) {
      filtered = list.filter((item) => item.id !== oldId);
    }
    // Remove if duplicate ID exists
    filtered = filtered.filter((item) => item.id !== run.id);
    
    filtered.unshift(run);
    fs.writeFileSync(executionsFile, JSON.stringify(filtered.slice(0, 50), null, 2));
  } catch (err) {
    console.error("Error writing detailed execution file:", err);
  }
}
