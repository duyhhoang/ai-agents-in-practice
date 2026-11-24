import { NextResponse } from "next/server";

export async function POST() {
  try {
    console.log(`[Next.js API Proxy] Forwarding ingestion trigger request to backend...`);
    const res = await fetch("http://localhost:8000/ingestion/trigger", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        errorJson = { error: errorText || `Backend responded with status ${res.status}` };
      }
      return NextResponse.json(errorJson, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in Next.js ingestion trigger proxy API route:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
