import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const incomingFormData = await request.formData();
    const file = incomingFormData.get("file");
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const outgoingFormData = new FormData();
    outgoingFormData.append("file", file);

    console.log(`[Next.js API Proxy] Forwarding file upload request to backend...`);
    const res = await fetch("http://localhost:8000/api/upload", {
      method: "POST",
      body: outgoingFormData
    });

    if (!res.ok) {
      const errorText = await res.text();
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        errorJson = { error: errorText || `Backend responded with status ${res.status}` };
      }
      return NextResponse.json(errorJson, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in Next.js upload proxy API route:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
