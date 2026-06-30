"use client";

import { useEffect, useState, useRef } from "react";
import { 
  UploadCloud, 
  RefreshCw, 
  Terminal as TerminalIcon, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle 
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

export default function IngestionView() {
  const [files, setFiles] = useState<IngestionFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [logs, setLogs] = useState<ConsoleLog[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const consoleBottomRef = useRef<HTMLDivElement>(null);

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
    <div className="p-8 max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.4em] text-cyan-300">Ingestion Layer</div>
          <h1 className="text-4xl font-black tracking-widest text-white mt-1">DATA INGESTION</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadFiles}
            className="flex h-10 items-center gap-2 rounded-xl border border-cyan-400/20 bg-slate-900/40 px-4 text-xs font-semibold text-cyan-100 hover:bg-slate-900/80 transition"
          >
            <RefreshCw size={14} className={loadingFiles ? "animate-spin" : ""} />
            Refresh Files
          </button>

          <button
            onClick={handleTriggerIngestion}
            disabled={triggering || uploading}
            className="flex h-10 items-center gap-2 rounded-xl border border-cyan-300/40 bg-cyan-400/15 px-4 text-xs font-bold text-cyan-100 transition hover:bg-cyan-400/25 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={triggering ? "animate-spin" : ""} />
            Trigger Extraction Pipeline
          </button>
        </div>
      </div>

      {/* Grid: Upload & File Status (Left) and Console Log (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        
        {/* Left Side: Upload Zone & Files Table */}
        <div className="space-y-6">
          {/* Upload Card */}
          <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-6 backdrop-blur-xl">
            <h3 className="text-lg font-bold text-white mb-4 tracking-wide flex items-center gap-2">
              <UploadCloud className="text-cyan-400" size={20} />
              Upload Source Document
            </h3>
            
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-cyan-400/20 rounded-2xl p-8 text-center cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-400/5 transition group relative overflow-hidden"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.md"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading || triggering}
              />
              <UploadCloud size={36} className="mx-auto text-cyan-400/50 group-hover:text-cyan-400 group-hover:scale-110 transition duration-300" />
              <p className="mt-4 text-sm font-bold text-white">Click or drag to select file</p>
              <p className="mt-1 text-xs text-cyan-100/40 font-mono">Supports CSV execution logs, incident logs, VDE audits (.csv, .txt, .md)</p>
              {uploading && (
                <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center text-xs font-mono text-cyan-300">
                  Uploading to data-processors directory...
                </div>
              )}
            </div>
          </div>

          {/* Files List Table */}
          <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-6 backdrop-blur-xl flex flex-col h-[400px]">
            <h3 className="text-lg font-bold text-white mb-4 tracking-wide flex items-center gap-2">
              <FileText className="text-cyan-400" size={20} />
              Ingestion Sources & Cache Status
            </h3>

            <div className="flex-1 overflow-y-auto border border-cyan-400/10 rounded-2xl bg-black/20">
              {loadingFiles ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-cyan-100/40">
                  Loading files catalog...
                </div>
              ) : files.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs font-mono text-cyan-100/40">
                  No compatible files found in data-processors.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-cyan-400/10 bg-slate-900/40 text-cyan-300 uppercase tracking-widest text-[9px] font-bold">
                      <th className="p-4">Filename</th>
                      <th className="p-4">Size</th>
                      <th className="p-4">MD5 Hash</th>
                      <th className="p-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file, idx) => (
                      <tr key={idx} className="border-b border-cyan-400/5 hover:bg-slate-900/20 transition">
                        <td className="p-4 text-white font-semibold truncate max-w-[200px]" title={file.name}>
                          {file.name}
                        </td>
                        <td className="p-4 text-cyan-100/70">
                          {(file.size / 1024).toFixed(1)} KB
                        </td>
                        <td className="p-4 text-cyan-100/40 text-[10px]">
                          {file.hash}
                        </td>
                        <td className="p-4 text-center">
                          {file.processed ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-400 border border-emerald-400/20 uppercase tracking-wider">
                              <CheckCircle size={10} /> Ingested
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-950/40 text-amber-400 border border-amber-400/20 uppercase tracking-wider">
                              <AlertCircle size={10} /> Pending
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Ingestion Console Log */}
        <div className="rounded-3xl border border-cyan-400/20 bg-slate-950/70 p-6 backdrop-blur-xl flex flex-col h-[585px]">
          <h3 className="text-lg font-bold text-white mb-4 tracking-wide flex items-center gap-2">
            <TerminalIcon className="text-cyan-400" size={20} />
            Pipeline console logs
          </h3>

          <div className="flex-1 overflow-y-auto rounded-2xl border border-cyan-400/10 bg-black/45 p-4 font-mono text-xs space-y-3 scrollbar-thin">
            {logs.map((log, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-cyan-400/60 shrink-0">[{log.timestamp}]</span>
                <span className={
                  log.type === "success" 
                    ? "text-emerald-400 font-semibold" 
                    : log.type === "error" 
                    ? "text-red-400 font-semibold" 
                    : "text-cyan-100/80"
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
  );
}
