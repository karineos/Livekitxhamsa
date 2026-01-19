import dotenv from "dotenv";
dotenv.config({ path: new URL("./.env", import.meta.url), override: true });

import fetch from "node-fetch";
import FormData from "form-data";
import { AccessToken } from "livekit-server-sdk";
import {
  Room,
  RoomEvent,
  TrackKind,
  AudioStream,
} from "@livekit/rtc-node";

function must(k) {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function makeToken(room, identity) {
  const at = new AccessToken(must("LIVEKIT_API_KEY"), must("LIVEKIT_API_SECRET"), { identity });
  at.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });
  return at.toJwt();
}

// --- resample 48k -> 16k (linear) ---
function resampleFloat32Linear(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

function float32ToPCM16LE(f32) {
  const b = Buffer.alloc(f32.length * 2);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    b.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  return b;
}

function wavHeader(sampleRate, numSamples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + dataSize, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(numChannels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(byteRate, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write("data", 36);
  h.writeUInt32LE(dataSize, 40);
  return h;
}

async function callVoiceApi(wavBuf) {
  const fd = new FormData();
  fd.append("audio", wavBuf, { filename: "audio.wav", contentType: "audio/wav" });

  const res = await fetch(must("VOICE_API_URL"), { method: "POST", body: fd });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error(j?.error || `voice api error ${res.status}`);
  return { transcript: j?.transcript || "", reply: j?.reply || "" };
}

async function main() {
  const roomName = must("ROOM");
  const botId = must("BOT_IDENTITY");
  const url = must("LIVEKIT_URL");

  console.log("LIVEKIT_URL =", url);
  console.log("ROOM =", roomName);
  console.log("BOT_IDENTITY =", botId);

  const room = new Room();
  room.on(RoomEvent.Disconnected, () => console.log("Bot disconnected"));

  const token = makeToken(roomName, botId);
  await room.connect(url, token);
  console.log("Bot connected to", roomName);

  const IN_RATE = 48000;
  const STT_RATE = 16000;

  let busy = false;

  room.on(RoomEvent.TrackSubscribed, async (track, pub, participant) => {
    if (track.kind !== TrackKind.KIND_AUDIO) return;
    if (participant.identity === botId) return;

    console.log("User audio subscribed:", participant.identity);

    const stream = new AudioStream(track);
    let chunks = [];
    let started = Date.now();

    for await (const frame of stream) {
      if (busy) continue;

      chunks.push(frame.data);

      const elapsed = Date.now() - started;
      if (elapsed >= 3500) {
        const totalLen = chunks.reduce((a, b) => a + b.length, 0);
        const merged = new Float32Array(totalLen);
        let off = 0;
        for (const c of chunks) { merged.set(c, off); off += c.length; }

        chunks = [];
        started = Date.now();

        const mono16 = resampleFloat32Linear(merged, IN_RATE, STT_RATE);
        const wav = Buffer.concat([wavHeader(STT_RATE, mono16.length), float32ToPCM16LE(mono16)]);

        busy = true;
        try {
          console.log("→ /api/voice");
          const { transcript, reply } = await callVoiceApi(wav);
          console.log("STT:", transcript);
          console.log("BOT:", reply);

          const payload = new TextEncoder().encode(
            JSON.stringify({ type: "voice_result", transcript, reply })
          );

          // RELIABLE so UI always receives it
          await room.localParticipant.publishData(payload, "reliable");
        } catch (e) {
          console.error("voice pipeline failed:", e?.message || e);
        } finally {
          busy = false;
        }
      }
    }
  });

  console.log("Waiting…");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
