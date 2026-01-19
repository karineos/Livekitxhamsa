import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json();
  const identity = body.identity ?? `user-${Date.now()}`;
  const room = body.room ?? "demo-room";

  const url = new URL("http://127.0.0.1:8000/api/token");
  url.searchParams.set("identity", identity);
  url.searchParams.set("room", room);

  const r = await fetch(url.toString());
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
