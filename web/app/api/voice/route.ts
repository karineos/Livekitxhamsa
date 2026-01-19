import { NextResponse } from "next/server";

export const runtime = "nodejs";

function encHeader(s: string) {
  // your client does decodeURIComponent(...)
  return encodeURIComponent(s ?? "");
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("audio");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 });
    }

    // 1) STT (send multipart to your Next /api/stt or directly to FastAPI)
    const sttForm = new FormData();
    sttForm.append("audio", file, "audio.wav");

    const sttRes = await fetch("http://127.0.0.1:8000/api/stt", {
      method: "POST",
      body: sttForm,
    });

    const sttJson = await sttRes.json();
    if (!sttRes.ok) {
      return NextResponse.json({ error: sttJson?.error || "STT error" }, { status: 500 });
    }

    const transcript = (sttJson?.text ?? "").trim();
    if (!transcript) {
      return NextResponse.json({ error: "No speech detected" }, { status: 400 });
    }

    // 2) CHAT (call your existing Next route, OR call FastAPI /api/chat)
    // We'll call your existing Next route so it keeps your Qdrant+AOAI logic in one place.
    const chatRes = await fetch(new URL("/api/chat", req.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: transcript }),
    });
    const chatJson = await chatRes.json();
    if (!chatRes.ok) {
      return NextResponse.json({ error: chatJson?.error || "Chat error" }, { status: 500 });
    }

    const reply = (chatJson?.answer ?? "").trim() || "—";

    // 3) TTS (get audio bytes from FastAPI)
    const ttsRes = await fetch("http://127.0.0.1:8000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: reply }),
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      return NextResponse.json({ error: errText || "TTS error" }, { status: 500 });
    }

    const audioBuf = await ttsRes.arrayBuffer();
    const contentType = ttsRes.headers.get("content-type") ?? "audio/wav";

    // 4) Return audio + headers UI expects
    return new Response(audioBuf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
        "X-Transcript": encHeader(transcript),
        "X-Reply": encHeader(reply),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
