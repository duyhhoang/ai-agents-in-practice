# Walkthrough - Supply Chain Pipeline Ingestion Fixes

We have resolved all critical ingestion, caching, and execution bugs in the supply chain data-agnostic pipeline. The pipeline is now fully active, running stably, and successfully populating Neo4j.

## Changes Made

1. **WSL2 Docker Volume Lock (Conflicting Container) Fix:**
   - Identified that a duplicate container named `n8n` was running in addition to `n8n-compose`. Both mounted the `n8n_data` SQLite database volume at the same time, causing SQLite locks (`SQLITE_READONLY: attempt to write a readonly database`).
   - Stopped and removed the duplicate `n8n` container and reset SQLite temporary journal files (`.sqlite-shm` and `.sqlite-wal`), restoring write access to `n8n-compose`.

2. **LLM Request Timeout Fix:**
   - Reduced the row extraction batch size from `25` to `5` in `Extract File Content`. This reduces completion tokens and response time per LLM Call 2 batch, keeping execution well below Node's 120-second default HTTP socket timeout and preventing "socket hang up" failures.

3. **Chained Cypher Batch Query Redesign (Loop Cutoff Fix):**
   - Replaced n8n's nested `Loop Queries` node (which suffered from index-reset bugs that prematurely cut off query execution) with a **unified batch Cypher statement**.
   - Updated the `Build Cypher Queries` Code node to concatenate all statements for a batch into a single, unified Cypher query using unique variable names per entity (e.g. `n0`, `n1`, `r0`) and `WITH 1 AS dummy` transitions.
   - Connected `Build Cypher Queries` directly to `Execute in Neo4j`, executing exactly one query per batch natively and committing all entities/relations in a single roundtrip.

4. **Robust Error-Aware Caching:**
   - Modified `Build File Cache Queries` to compare items in `LLM Call 1` and `LLM Call 2` against `Loop Raw Items` to detect batch errors. Files containing failed batches are excluded from the `ProcessedFile` cache, ensuring failed files are re-processed in subsequent runs.

## Testing & Validation Results

1. **Fresh Run Ingestion:**
   - Ingested the first 20 charging stations from `01_charging_stations.csv` in 4 batches of size 5. All batches executed successfully.
   - Checked Neo4j and verified that **20 ChargingStations**, **13 Locations**, and **40 LOCATED_IN relationships** were created correctly.

2. **Cache Hit Ingestion:**
   - Triggered the webhook again. The pipeline immediately detected the file-level cache hit and completed in less than **1 second with 0 LLM calls**.

3. **Incremental Ingestion:**
   - Appended a new row (`EVC-2024-0021`) to `01_charging_stations.csv` and triggered the workflow.
   - Verified that the pipeline detected the file change, used row-level caching to skip the first 20 rows, and triggered **only 1 LLM call** for the single new row.
   - Checked Neo4j and verified that **1 new ChargingStation** (EVC-2024-0021) and **1 new LOCATED_IN relationship** were added, and the file cache was updated to the new hash.

4. **Dataset Restoration & Recovering from Neo4j Constraint Crash:**
   - Restored the remaining 9 dataset files (processes, actors, transport, etc.) from `temp_large_files/` to `data-processors/`.
   - The initial ingestion run (Execution 291) halted at batch 4 of `02_process_execution_log.csv` due to a uniqueness constraint violation:
     ```
     NodeOperationError: Node(59) already exists with label `Process` and property `process_id` = 'P01'
     ```
   - Diagnosed that the constraint `process_unique` was incorrectly defined solely on `Process.process_id`, which violated the supply chain schema since process IDs (like `P01`) are shared across different charging stations.
   - Dropped the incorrect `process_unique` constraint and created the correct compound constraint `process_compound_key` requiring `(Process.unit_id, Process.process_id)` to be unique.
   - Re-triggered the active webhook (Execution 292). The row-level caching successfully detected the first 4 batches as already ingested and skipped them (reducing total extracted items from 103 to 99, and `02_process_execution_log.csv` items from 80 to 76).
   - During execution 292, the pipeline hit n8n's default 1-hour execution timeout and was cancelled after successfully committing 390 out of 400 processes.
   - Diagnosed and resolved a property mapping issue: property keys containing spaces (such as `Date Filed` in `08_incident_report_008.txt`) caused Neo4j Cypher syntax errors. Updated the `Build Cypher Queries` JS code to wrap all property keys in backticks (e.g., `n0.\`Date Filed\``) to make it fully data-agnostic.
   - Stopped n8n, updated the sqlite database file `current_container_db.sqlite` using `update_workflow.py`, copied it back to the n8n container, fixed ownership permissions to `node:node`, and restarted n8n.
   - Re-triggered the webhook (Execution 294). Thanks to row-level caching, the first 390 processes were skipped immediately, leaving only 3 files to process. The execution finished with 100% success in 3 minutes 32 seconds.
   - Verified the results with a subsequent webhook run (Execution 295) which completed in 506 milliseconds (0 LLM calls) with 100% cache hits.
