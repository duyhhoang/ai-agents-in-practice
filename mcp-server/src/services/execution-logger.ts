import { getNeo4jDriver } from "../neo4j-client.js";
import crypto from "crypto";

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

export async function getExecutions(): Promise<ExecutionRun[]> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const res = await session.executeRead((tx) =>
      tx.run(`
        MATCH (e:IngestionExecution)
        RETURN e.id AS id, 
               e.workflowName AS workflowName, 
               e.timestamp AS timestamp, 
               e.triggerType AS triggerType, 
               e.status AS status, 
               e.durationMs AS durationMs, 
               e.filesProcessed AS filesProcessed, 
               e.error AS error, 
               e.filesJson AS filesJson
        ORDER BY e.timestamp DESC 
        LIMIT 50
      `)
    );
    return res.records.map((record) => {
      const id = record.get("id");
      const workflowName = record.get("workflowName") || null;
      const timestamp = record.get("timestamp");
      const triggerType = record.get("triggerType");
      const status = record.get("status") as "Success" | "Failed" | "Running";
      
      const rawDurationMs = record.get("durationMs");
      const durationMs = typeof rawDurationMs?.toNumber === "function" ? rawDurationMs.toNumber() : Number(rawDurationMs || 0);
      
      const rawFilesProcessed = record.get("filesProcessed");
      const filesProcessed = typeof rawFilesProcessed?.toNumber === "function" ? rawFilesProcessed.toNumber() : Number(rawFilesProcessed || 0);
      
      const error = record.get("error") || null;
      const filesJson = record.get("filesJson") || "[]";
      let files = [];
      try {
        files = JSON.parse(filesJson);
      } catch (e) {
        console.error("Failed to parse filesJson in execution log:", e);
      }
      return {
        id,
        workflowName,
        timestamp,
        triggerType,
        status,
        durationMs,
        filesProcessed,
        error,
        files
      };
    });
  } catch (err) {
    console.error("Error reading executions from Neo4j:", err);
    return [];
  } finally {
    await session.close();
  }
}

export async function logExecution(
  triggerType: string,
  status: "Success" | "Failed" | "Running",
  durationMs: number,
  filesProcessed: number,
  error: string | null = null
): Promise<void> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    await session.executeWrite((tx) =>
      tx.run(
        `
        MERGE (e:IngestionExecution {id: $id})
        SET e.timestamp = $timestamp,
            e.triggerType = $triggerType,
            e.status = $status,
            e.durationMs = $durationMs,
            e.filesProcessed = $filesProcessed,
            e.error = $error,
            e.filesJson = $filesJson
        `,
        {
          id: "exec-" + crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          triggerType,
          status,
          durationMs,
          filesProcessed,
          error,
          filesJson: "[]"
        }
      )
    );
  } catch (err) {
    console.error("Error writing execution to Neo4j:", err);
  } finally {
    await session.close();
  }
}

export async function logDetailedExecution(run: ExecutionRun, oldId?: string): Promise<void> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    if (oldId && oldId !== run.id) {
      await session.executeWrite((tx) =>
        tx.run(
          `
          MATCH (e:IngestionExecution {id: $oldId})
          DETACH DELETE e
          `,
          { oldId }
        )
      );
    }
    await session.executeWrite((tx) =>
      tx.run(
        `
        MERGE (e:IngestionExecution {id: $id})
        SET e.workflowName = $workflowName,
            e.timestamp = $timestamp,
            e.triggerType = $triggerType,
            e.status = $status,
            e.durationMs = $durationMs,
            e.filesProcessed = $filesProcessed,
            e.error = $error,
            e.filesJson = $filesJson
        `,
        {
          id: run.id,
          workflowName: run.workflowName || "07_LLM_Entity_Extraction_v3_HTTP",
          timestamp: run.timestamp,
          triggerType: run.triggerType,
          status: run.status,
          durationMs: run.durationMs,
          filesProcessed: run.filesProcessed,
          error: run.error,
          filesJson: JSON.stringify(run.files || [])
        }
      )
    );
  } catch (err) {
    console.error("Error writing detailed execution to Neo4j:", err);
  } finally {
    await session.close();
  }
}

export async function cleanupStuckRunningExecutions(): Promise<void> {
  const driver = getNeo4jDriver();
  const session = driver.session();
  try {
    const result = await session.executeWrite((tx) =>
      tx.run(`
        MATCH (e:IngestionExecution {status: 'Running'})
        SET e.status = 'Failed',
            e.error = 'Execution terminated abnormally or timed out'
        RETURN count(e) AS count
      `)
    );
    const count = result.records[0]?.get("count")?.toNumber() || 0;
    if (count > 0) {
      console.log(`[Execution Logger] Cleaned up ${count} stuck 'Running' executions.`);
    }
  } catch (err) {
    console.error("[Execution Logger] Error cleaning up stuck executions:", err);
  } finally {
    await session.close();
  }
}
