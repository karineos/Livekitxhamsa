"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { recordWavUntilSilence } from "./lib/recordWav";
import { Room } from "livekit-client";
import { MessageCircle, X, Send } from "lucide-react";

type Phase = "idle" | "hover" | "listening" | "thinking" | "speaking";

function Wave({ active }: { active: boolean }) {
  const bars = useMemo(() => Array.from({ length: 7 }), []);
  return (
    <div className="wave">
      {bars.map((_, i) => (
        <span
          key={i}
          className={`bar ${active ? "active" : ""}`}
          style={{ animationDelay: `${i * 0.07}s` }}
        />
      ))}
    </div>
  );
}

export default function Page() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const roomRef = useRef<Room | null>(null);

  const speakingAudioRef = useRef<HTMLAudioElement | null>(null);

  const isActive = phase === "listening" || phase === "speaking";
const [chatOpen, setChatOpen] = useState(false);
const [chatInput, setChatInput] = useState("");
const [chatLoading, setChatLoading] = useState(false);
const [chatMsgs, setChatMsgs] = useState<{ role: "user" | "bot"; text: string }[]>([
  { role: "bot", text: "مرحباً، أنا بلادي، وأنا هنا لمساعدتك في أي استفسار بخصوص بنك البلاد." },
]);

async function sendChat() {
  const msg = chatInput.trim();
  if (!msg || chatLoading) return;

  setChatMsgs((m) => [...m, { role: "user", text: msg }]);
  setChatInput("");
  setChatLoading(true);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Chat error");

    setChatMsgs((m) => [...m, { role: "bot", text: j.answer || "—" }]);
  } catch (e: any) {
    setChatMsgs((m) => [...m, { role: "bot", text: `❌ ${String(e?.message || e)}` }]);
  } finally {
    setChatLoading(false);
  }
}

  useEffect(() => {
    if (phase === "idle") {
      setTranscript("");
      setReply("");
      setErr(null);
    }
  }, [phase]);
  async function startCall() {

      setErr(null);
      try {
        const res = await fetch("/api/livekit-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room: "demo-room", identity: `user-${Date.now()}` }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Token error");

        const room = new Room({ adaptiveStream: true, dynacast: true });
        room.on("connected", () => setConnected(true));
        room.on("disconnected", () => setConnected(false));

        roomRef.current = room;

        // IMPORTANT: pass base URL only (no /rtc), SDK appends /rtc itself
        const wsUrl = (process.env.NEXT_PUBLIC_LIVEKIT_URL || "").replace(/\/rtc\/?$/, "");
        if (!wsUrl) throw new Error("NEXT_PUBLIC_LIVEKIT_URL is missing. Add it to .env.local and restart Next.");

        await room.connect(wsUrl, data.token);




        // publish mic
        await room.localParticipant.setMicrophoneEnabled(true);

        setPhase("listening"); // your UI phase
      } catch (e: any) {
        setErr(String(e?.message || e));
        setConnected(false);
        setPhase("hover");
      }
}

function endCall() {
  roomRef.current?.disconnect();
  roomRef.current = null;
  setConnected(false);
  setPhase("hover");
}

const recAbortRef = useRef<AbortController | null>(null);
const recInFlightRef = useRef(false);

async function clickToTalk() {
  // If we are already listening, a second click stops recording immediately
  if (phase === "listening" && recAbortRef.current) {
    recAbortRef.current.abort();
    return;
  }

  if (recInFlightRef.current) return; // prevent double runs
  recInFlightRef.current = true;

  setErr(null);
  setTranscript("");
  setReply("");

  try {
    setPhase("listening");

    const ac = new AbortController();
    recAbortRef.current = ac;

    // Records until:
    // - user clicks again (abort)
    // - 2s silence (after speech starts)
    // - max 15s
    const wav = await recordWavUntilSilence(16000, 2000, 15000, ac.signal);

    recAbortRef.current = null;
    setPhase("thinking");

    const fd = new FormData();
    fd.append("audio", wav, "audio.wav");

    const res = await fetch("/api/voice", { method: "POST", body: fd });
    const ct = res.headers.get("content-type") || "";

    if (ct.includes("application/json")) {
      const j = await res.json();
      setErr(j?.error || "Unknown error");
      setPhase("hover");
      return;
    }

    const t = res.headers.get("X-Transcript");
    const r = res.headers.get("X-Reply");
    if (t) setTranscript(decodeURIComponent(t));
    if (r) setReply(decodeURIComponent(r));

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    if (speakingAudioRef.current) speakingAudioRef.current.pause();
    const a = new Audio(url);
    speakingAudioRef.current = a;

    setPhase("speaking");
    a.onended = () => setPhase("hover");
    await a.play();
  } catch (e: any) {
    // If aborted while listening, we still return a WAV (we handle abort by finishing),
    // so reaching here is a true error.
    setErr(String(e?.message || e));
    setPhase("hover");
  } finally {
    recInFlightRef.current = false;
  }
}


  return (
    <div className="root">
      <div
        className="stage"
        onMouseEnter={() => phase === "idle" && setPhase("hover")}
        onMouseLeave={() => (phase === "hover" ? setPhase("idle") : undefined)}
      >
        <div className={`bubbles ${isActive ? "spread" : ""}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`bubble b${i + 1}`} />
          ))}
        </div>

        <div
          className={`core ${phase}`}
          onClick={(e) => {
            e.stopPropagation();
            clickToTalk();
          }}
        >

          <div className="coreInner">
            <Wave active={phase === "listening" || phase === "speaking"} />
            {(phase === "hover" || phase === "idle") && (
              <div className="hint">Speak </div>
            )}
            {phase === "thinking" && <div className="hint">Thinking…</div>}
          </div>
                {!connected && (phase === "hover" || phase === "idle") && (
                  <button
                    className="cta"
                    onClick={(e) => {
                      e.stopPropagation(); // ⛔ prevents hover flicker
                      startCall();
                    }}
                  >
                    CLICK TO TALK
                  </button>
                )}

                {connected && (
                  <button
                    className="cta hangup"
                    onClick={(e) => {
                      e.stopPropagation();
                      endCall();
                    }}
                  >
                    HANG UP
                  </button>
                )}

        </div>

        <div className="panel">
          <div className="row">
            <div className="label">You</div>
            <div className="text">{transcript || "—"}</div>
          </div>
          <div className="row">
            <div className="label">Bot</div>
            <div className="text">{reply || "—"}</div>
          </div>
          {err && (
            <div className="err">
              {err}
            </div>
          )}
        </div>
        {/* Floating Chat Button */}
<button
  className={`chatFab ${chatOpen ? "open" : ""}`}
  onClick={(e) => {
    e.stopPropagation();
    setChatOpen((v) => !v);
  }}
  aria-label="Open chat"
>
  <span className="chatFabGlow" />
  {chatOpen ? <X size={18} /> : <MessageCircle size={18} />}
</button>

{/* Chat Drawer */}
<div className={`chatDrawer ${chatOpen ? "show" : ""}`} onClick={(e) => e.stopPropagation()}>
  <div className="chatHeader">
    <div className="chatTitle">
      <span className="dot" />
      Knowledge Chat
    </div>
    <div className="chatSub">Bank al Bilad assistant</div>
  </div>

  <div className="chatBody">
    {chatMsgs.map((m, i) => (
      <div key={i} className={`msg ${m.role}`}>
        <div className="bubbleMsg">{m.text}</div>
      </div>
    ))}
    {chatLoading && (
      <div className="msg bot">
        <div className="bubbleMsg typing">
          <span />
          <span />
          <span />
        </div>
      </div>
    )}
  </div>

  <div className="chatInputRow">
    <input
      className="chatInput"
      value={chatInput}
      onChange={(e) => setChatInput(e.target.value)}
      placeholder="اكتب سؤالك هنا…"
      onKeyDown={(e) => {
        if (e.key === "Enter") sendChat();
      }}
    />
    <button className="sendBtn" onClick={sendChat} disabled={chatLoading}>
      <Send size={16} />
    </button>
  </div>
</div>

      </div>

      <style jsx global>{`
        :root { color-scheme: light; }
        body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system; }
        .root {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background:
            radial-gradient(1200px 600px at 50% 35%, rgba(0, 180, 80, 0.12), transparent 60%),
            linear-gradient(180deg, #f8fbff, #f5f7fb);
          overflow: hidden;
        }
        .stage {
          width: min(980px, 92vw);
          height: min(640px, 78vh);
          position: relative;
          border-radius: 28px;
          background:
            radial-gradient(circle at 30% 20%, rgba(0,160,90,0.10), transparent 55%),
            radial-gradient(circle at 70% 60%, rgba(0,160,90,0.10), transparent 55%),
            repeating-linear-gradient(110deg, rgba(20,40,60,0.06) 0 2px, transparent 2px 22px);
          box-shadow: 0 30px 80px rgba(10, 25, 40, 0.12);
          overflow: hidden;
        }

        .bubbles {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          pointer-events: none;
        }
        .bubble {
          position: absolute;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          background: rgba(0, 160, 90, 0.18);
          filter: blur(0px);
          transform: translate(0, 0) scale(0.92);
          transition: transform 700ms cubic-bezier(.2,.9,.2,1), opacity 700ms, background 700ms;
          opacity: 0.0;
        }
        .bubbles.spread .bubble { opacity: 1; }
        .bubbles.spread .b1 { transform: translate(-260px, 0px) scale(0.95); }
        .bubbles.spread .b2 { transform: translate(-130px, 0px) scale(0.95); background: rgba(0, 160, 90, 0.26); }
        .bubbles.spread .b3 { transform: translate(0px, 0px) scale(1.05); background: rgba(0, 160, 90, 0.20); }
        .bubbles.spread .b4 { transform: translate(130px, 0px) scale(0.95); background: rgba(0, 160, 90, 0.26); }
        .bubbles.spread .b5 { transform: translate(260px, 0px) scale(0.95); }

        .core {
          position: absolute;
          left: 50%;
          top: 42%;
          transform: translate(-50%, -50%);
          width: 240px;
          height: 240px;
          border-radius: 999px;
          background: rgba(0, 160, 90, 0.18);
          backdrop-filter: blur(10px);
          display: grid;
          place-items: center;
          transition: transform 350ms ease, background 350ms ease;
        }
        .core.hover { transform: translate(-50%, -50%) scale(1.02); background: rgba(0,160,90,0.22); }
        .core.listening { transform: translate(-50%, -50%) scale(1.06); background: rgba(0,160,90,0.26); }
        .core.speaking { transform: translate(-50%, -50%) scale(1.06); background: rgba(0,160,90,0.26); }
        .core.thinking { transform: translate(-50%, -50%) scale(1.04); background: rgba(0,160,90,0.22); }

        .coreInner { display: grid; place-items: center; gap: 12px; }
        .hint { font-weight: 700; opacity: 0.75; }

        .cta {
          position: absolute;
          left: 50%;
          top: calc(100% + 18px);
          transform: translateX(-50%);
          border: none;
          padding: 12px 18px;
          border-radius: 999px;
          font-weight: 800;
          letter-spacing: 0.04em;
          cursor: pointer;
          background: #0b0f14;
          color: white;
          box-shadow: 0 18px 40px rgba(0,0,0,0.18);
          transition: transform 180ms ease, opacity 180ms ease;
        }
        .cta:hover { transform: translateX(-50%) scale(1.03); }
        .cta:active { transform: translateX(-50%) scale(0.98); }

        .wave {
          height: 28px;
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }
        .bar {
          width: 7px;
          height: 10px;
          border-radius: 999px;
          background: rgba(0,160,90,0.85);
          opacity: 0.25;
        }
        .bar.active {
          opacity: 0.95;
          animation: bounce 0.55s infinite ease-in-out;
        }
        @keyframes bounce {
          0%,100% { height: 10px; }
          50% { height: 28px; }
        }
          .chatFab {
  position: absolute;
  right: 22px;
  bottom: 22px;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 40px rgba(10,25,40,0.14);
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: transform 180ms ease, box-shadow 180ms ease;
  overflow: hidden;
}
.chatFab:hover { transform: translateY(-2px); }
.chatFab:active { transform: translateY(0px) scale(0.98); }
.chatFabGlow {
  position: absolute;
  inset: -30px;
  background: radial-gradient(circle at 30% 20%, rgba(0,160,90,0.35), transparent 55%);
  opacity: 0.55;
  pointer-events: none;
}
.chatFab.open { box-shadow: 0 20px 46px rgba(0,160,90,0.18); }

.chatDrawer {
  position: absolute;
  right: 18px;
  bottom: 76px;
  width: min(360px, 88vw);
  height: 420px;
  border-radius: 18px;
  border: 1px solid rgba(0,0,0,0.08);
  background: rgba(255,255,255,0.82);
  backdrop-filter: blur(14px);
  box-shadow: 0 30px 80px rgba(10,25,40,0.18);
  display: grid;
  grid-template-rows: auto 1fr auto;
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  pointer-events: none;
  transition: opacity 220ms ease, transform 220ms ease;
}
.chatDrawer.show {
  opacity: 1;
  transform: translateY(0px) scale(1);
  pointer-events: auto;
}

.chatHeader {
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(0,0,0,0.06);
}
.chatTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 900;
}
.chatTitle .dot {
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgba(0,160,90,0.9);
  box-shadow: 0 0 0 6px rgba(0,160,90,0.12);
}
.chatSub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.65;
  font-weight: 700;
}

.chatBody {
  padding: 12px 12px;
  overflow: auto;
  display: grid;
  gap: 10px;
}

.msg { display: flex; }
.msg.user { justify-content: flex-end; }
.msg.bot { justify-content: flex-start; }

.bubbleMsg {
  max-width: 82%;
  padding: 10px 12px;
  border-radius: 14px;
  font-weight: 700;
  line-height: 1.35;
  font-size: 13px;
  border: 1px solid rgba(0,0,0,0.06);
}
.msg.user .bubbleMsg {
  background: rgba(0,160,90,0.18);
}
.msg.bot .bubbleMsg {
  background: rgba(255,255,255,0.86);
}

.bubbleMsg.typing {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}
.bubbleMsg.typing span {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: rgba(0,0,0,0.35);
  animation: typing 0.9s infinite ease-in-out;
}
.bubbleMsg.typing span:nth-child(2) { animation-delay: 0.15s; }
.bubbleMsg.typing span:nth-child(3) { animation-delay: 0.30s; }
@keyframes typing {
  0%,100% { transform: translateY(0); opacity: 0.35; }
  50% { transform: translateY(-3px); opacity: 0.85; }
}

.chatInputRow {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  padding: 10px 10px;
  border-top: 1px solid rgba(0,0,0,0.06);
}
.chatInput {
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 12px;
  padding: 10px 12px;
  outline: none;
  font-weight: 800;
  background: rgba(255,255,255,0.9);
}
.chatInput:focus {
  border-color: rgba(0,160,90,0.45);
  box-shadow: 0 0 0 6px rgba(0,160,90,0.12);
}
.sendBtn {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  border: 1px solid rgba(0,0,0,0.10);
  background: #0b0f14;
  color: white;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: transform 160ms ease, opacity 160ms ease;
}
.sendBtn:active { transform: scale(0.98); }
.sendBtn:disabled { opacity: 0.6; cursor: not-allowed; }


        .panel {
          position: absolute;
          left: 50%;
          bottom: 26px;
          transform: translateX(-50%);
          width: min(840px, 92%);
          background: rgba(255,255,255,0.72);
          border: 1px solid rgba(0,0,0,0.06);
          border-radius: 18px;
          padding: 14px 16px;
          backdrop-filter: blur(12px);
        }
        .row { display: grid; grid-template-columns: 70px 1fr; gap: 10px; padding: 6px 0; }
        .label { font-weight: 800; opacity: 0.7; }
        .text { opacity: 0.85; }
        .err { margin-top: 10px; color: #b00020; font-weight: 700; }
      `}</style>
    </div>
  );
}
