import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const form = await req.formData();

    // Forward the exact multipart FormData to FastAPI
    const r = await fetch("http://127.0.0.1:8000/api/stt", {
      method: "POST",
      body: form,
    });

    const data = await r.json();
    return NextResponse.json(data, { status: r.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
