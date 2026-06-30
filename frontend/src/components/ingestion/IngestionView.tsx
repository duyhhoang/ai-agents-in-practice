"use client";

import { useEffect, useState, useRef } from "react";
import { 
  UploadCloud, 
  RefreshCw, 
  Terminal as TerminalIcon, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  HelpCircle,
  X
} from "lucide-react";

type IngestionFile = {
  name: string;
  size: number;
  hash: string;
  processed: boolean;
};

type ConsoleLog = {
  timestamp: string;
  message: string;
  type: "system" | "success" | "error";
};

type ExecutionRun = {
  id: string;
  timestamp: string;
  triggerType: string;
  status: "Success" | "Failed";
  durationMs: number;
  filesProcessed: number;
  error: string | null;
};

export default function IngestionView() {
  const [files, setFiles] = useState<IngestionFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const [selectedFile, setSelectedFile] = useState<IngestionFile | null>(null);
  
  // Executions history states
  const [executions, setExecutions] = useState<ExecutionRun[]>([]);
  const [loadingExecs, setLoadingExecs] = useState(true);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

  // Load execution history
  async function loadExecutions() {
    try {
      const res = await fetch("/api/ingestion/executions");
      if (res.ok) {
        const data = await res.json();
        setExecutions(data);
      }
    } catch (err) {
      console.warn("Failed to retrieve pipeline executions history:", err);
    } finally {
      setLoadingExecs(false);
    }
  }

  // Load file status list
  async function loadFiles() {
    try {
      const res = await fetch("/api/ingestion/status");
      if (res.ok) {
        const data = await res.json();
        setFiles(data as IngestionFile[]);
      }
    } catch (err) {
      addLog("Failed to retrieve file status from backend.", "error");
    } finally {
      setLoadingFiles(false);
    }
    // Sync executions log
    loadExecutions();
  }

  function addLog(message: string, type: "system" | "success" | "error" = "system") {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev, { timestamp: time, message, type }]);
  }

  // Scroll console to bottom
  useEffect(() => {
    consoleBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    addLog("Ingestion engine initialized. Awaiting files...", "system");
    loadFiles();
  }, []);

  // Handle file upload
  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    addLog(`Uploading file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`, "system");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (res.ok) {
        addLog(`File uploaded successfully! Triggered n8n extraction pipeline.`, "success");
        if (data.answer) {
          addLog(data.answer.replace(/\*\*/g, ""), "success");
        }
        loadFiles();
      } else {
        addLog(`Upload failure: ${data.error || "Unknown server error."}`, "error");
      }
    } catch (err: any) {
      addLog(`Network connection error during upload: ${err.message}`, "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Trigger n8n ingestion pipeline manually
  async function handleTriggerIngestion() {
    setTriggering(true);
    addLog("Manual trigger dispatched. Dispatching HTTP request to n8n webhook...", "system");

    try {
      const res = await fetch("/api/ingestion/trigger", {
        method: "POST"
      });

      const data = await res.json();

      if (res.ok && data.success) {
        addLog(`Ingestion completed in ${(data.duration_ms / 1000).toFixed(2)}s. Processed ${data.processed_files} files.`, "success");
        loadFiles();
      } else {
        addLog(`Ingestion failed: ${data.error || "n8n response code " + res.status}`, "error");
      }
    } catch (err: any) {
      addLog(`Failed to communicate with n8n server: ${err.message}`, "error");
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#0065bd] font-bold">Ingestion Layer</div>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-1">DATA INGESTION</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="group relative flex items-center gap-1.5 text-slate-400 hover:text-slate-600 cursor-pointer mr-2">
            <HelpCircle size={16} />
            <span className="text-xs">Pipeline Info</span>
            <div className="pointer-events-none absolute right-0 top-6 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-xs text-slate-600 leading-normal">
              This panel enables uploading new raw logs (incident history, audit files) directly into the server. The n8n pipeline parses raw data, maps entities, and updates Neo4j.
            </div>
          </div>

          <button
            onClick={loadFiles}
            className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <RefreshCw size={12} className={loadingFiles ? "animate-spin" : ""} />
            Refresh List
          </button>

          <button
            onClick={handleTriggerIngestion}
            disabled={triggering || uploading}
            className="flex h-9 items-center gap-2 rounded-lg bg-[#0065bd] px-4 text-xs font-bold text-white transition hover:bg-[#005293] disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <RefreshCw size={12} className={triggering ? "animate-spin" : ""} />
            Trigger n8n Ingestion
          </button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        
        {/* Left Side: Upload Zone & Files Table (Col span 7) */}
        <div className="xl:col-span-7 space-y-6">
          {/* Upload Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <UploadCloud className="text-[#0065bd]" size={18} />
              Upload Source Document
            </h3>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#0065bd]/50 hover:bg-[#0065bd]/5 transition group relative overflow-hidden"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.md"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading || triggering}
              />
              <UploadCloud size={30} className="mx-auto text-slate-400 group-hover:text-[#0065bd] transition duration-200" />
              <p className="mt-3 text-xs font-bold text-slate-700">Click to select files from system</p>
              <p className="mt-1 text-[11px] text-slate-400 font-mono">Supports CSV logs, audits, text reports (.csv, .txt, .md)</p>
              {uploading && (
                <div className="absolute inset-0 bg-white/90 flex items-center justify-center text-xs font-mono text-[#0065bd] font-semibold">
                  Uploading and updating embeddings...
                </div>
              )}
            </div>
          </div>

          {/* Files List Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-[320px]">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileText className="text-[#0065bd]" size={18} />
                Document Cache Catalog
              </span>
              <div className="group relative cursor-pointer text-slate-400 hover:text-slate-600 flex items-center gap-1">
                <HelpCircle size={13} />
                <span className="text-[10px] uppercase font-bold">Status Guide</span>
                <div className="pointer-events-none absolute right-0 top-5 z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-[10px] text-slate-500 font-normal leading-relaxed normal-case tracking-normal">
                  <span className="font-bold text-slate-800">File Status Meanings:</span>
                  <ul className="mt-1 space-y-1 list-disc pl-4 font-sans">
                    <li><strong className="text-emerald-600">Active:</strong> The file is processed and indexed in the Neo4j database, ready for agent semantic retrieval.</li>
                    <li><strong className="text-amber-600">Queued:</strong> The file is staged in the upload folder but has not yet been processed by the n8n webhook. Trigger n8n to active.</li>
                  </ul>
                </div>
              </div>
            </h3>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50">
              {loadingFiles ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  Loading files catalog...
                </div>
              ) : files.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  No files found in cache directory.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-500 uppercase tracking-wider text-[9px] font-bold">
                      <th className="p-3">Filename</th>
                      <th className="p-3">Size</th>
                      <th className="p-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file, idx) => {
                      const isSelected = selectedFile?.name === file.name;
                      return (
                        <tr 
                          key={idx} 
                          onClick={() => setSelectedFile(file)}
                          className={`border-b border-slate-200/50 hover:bg-slate-100/50 cursor-pointer transition ${
                            isSelected ? "bg-[#0065bd]/5" : ""
                          }`}
                        >
                          <td className="p-3 text-slate-800 font-semibold truncate max-w-[220px]" title={file.name}>
                            {file.name}
                          </td>
                          <td className="p-3 text-slate-500">
                            {(file.size / 1024).toFixed(1)} KB
                          </td>
                          <td className="p-3 text-center">
                            {file.processed ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                                <CheckCircle size={10} /> Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 uppercase tracking-wider">
                                <AlertCircle size={10} /> Queued
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* n8n Executions History */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-[320px]">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <TerminalIcon className="text-[#0065bd]" size={18} />
                Pipeline Execution History (n8n logs)
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Workflow runs</span>
            </h3>

            <div className="flex-1 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50">
              {loadingExecs ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  Loading workflow runs...
                </div>
              ) : executions.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-slate-400">
                  No workflow executions recorded.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-500 uppercase tracking-wider text-[9px] font-bold">
                      <th className="p-3">Execution ID</th>
                      <th className="p-3">Trigger Source</th>
                      <th className="p-3">Duration</th>
                      <th className="p-3">Files</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((exec, idx) => {
                      const isSuccess = exec.status === "Success";
                      return (
                        <tr 
                          key={exec.id || idx}
                          className="border-b border-slate-200/50 hover:bg-slate-100/50 transition cursor-help"
                          title={exec.error ? `Error details: ${exec.error}` : "Workflow execution succeeded."}
                        >
                          <td className="p-3 text-slate-900 font-bold">
                            #{exec.id}
                          </td>
                          <td className="p-3 text-slate-600 font-medium">
                            {exec.triggerType}
                          </td>
                          <td className="p-3 text-slate-500">
                            {(exec.durationMs / 1000).toFixed(2)}s
                          </td>
                          <td className="p-3 text-slate-500">
                            {exec.filesProcessed} file{exec.filesProcessed !== 1 ? "s" : ""}
                          </td>
                          <td className="p-3 text-center">
                            {isSuccess ? (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 uppercase tracking-wider">
                                Success
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100 uppercase tracking-wider">
                                Failed
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-400 text-[10px]">
                            {new Date(exec.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        </div>

        {/* Right Side: Log Console & File Inspector (Col span 5) */}
        <div className="xl:col-span-5 flex flex-col gap-6">
          {/* File Inspector Detail Card */}
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-fit">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText size={16} className="text-[#0065bd]" />
                File Inspector
              </h3>
              {selectedFile && (
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="text-slate-400 hover:text-slate-600 p-0.5 rounded-lg hover:bg-slate-100 transition"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {selectedFile ? (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-mono font-bold text-slate-800 break-all">{selectedFile.name}</h4>
                  <p className="text-[10px] text-slate-400 font-mono mt-1">MD5 HASH: {selectedFile.hash}</p>
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-3 text-xs font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">File size</span>
                    <span className="text-slate-700 font-semibold">{(selectedFile.size / 1024).toFixed(2)} KB</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Database node status</span>
                    <span className={`font-semibold ${selectedFile.processed ? "text-emerald-600" : "text-amber-600"}`}>
                      {selectedFile.processed ? "Processed & Embedded" : "Pending Ingestion"}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-[11px] text-slate-500 leading-relaxed font-sans">
                  <span className="font-bold text-slate-700 text-[9px] uppercase tracking-wider block mb-1">Vector Index Status</span>
                  This document has been mapped to a <code className="bg-slate-100 px-1 py-0.5 rounded text-[#0065bd] font-mono text-[9px]">:ProcessedFile</code> node in Neo4j. Its textual content is chunked and stored along with a 1536-dimensional embedding vector in the <code className="bg-slate-100 px-1 py-0.5 rounded text-[#0065bd] font-mono text-[9px]">file_embeddings</code> vector index, enabling multi-agent semantic search retrieval (RAG).
                </div>
              </div>
            ) : (
              <div className="text-center py-6 px-4 text-slate-400 text-xs font-mono">
                Click any file row in the catalog table to inspect its properties and vector database indexing details.
              </div>
            )}
          </aside>

          {/* Ingestion Console Log */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col h-[320px]">
            <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
              <TerminalIcon className="text-slate-500" size={18} />
              Pipeline Console Logs
            </h3>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs space-y-2">
              {logs.map((log, idx) => (
                <div key={idx} className="flex items-start gap-1.5 leading-relaxed">
                  <span className="text-slate-400 shrink-0">[{log.timestamp}]</span>
                  <span className={
                    log.type === "success" 
                      ? "text-emerald-600 font-semibold" 
                      : log.type === "error" 
                      ? "text-rose-600 font-semibold" 
                      : "text-slate-600"
                  }>
                    {log.message}
                  </span>
                </div>
              ))}
              <div ref={consoleBottomRef} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
