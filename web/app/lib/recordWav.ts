// ./lib/recordWav.ts
// Records mic audio into 16kHz mono PCM WAV.
// Stops when:
//  - user requests stop via signal OR
//  - silence lasts `silenceMs` after speech has started OR
//  - maxMs reached
export async function recordWavUntilSilence(
  sampleRate = 16000,
  silenceMs = 2000,
  maxMs = 15000,
  signal?: AbortSignal
): Promise<Blob> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
    },
    video: false,
  });

  // Use AudioContext to get PCM floats
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const source = ctx.createMediaStreamSource(stream);

  // ScriptProcessor is deprecated but widely supported and simplest here.
  // Buffer size: 4096 is stable across browsers.
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  let totalSamples = 0;

  // Silence detection
  const silenceThreshold = 0.012; // tune if needed
  let speechStarted = false;
  let silenceStart = 0;
  const startTs = performance.now();

  let resolveFn!: (b: Blob) => void;
  let rejectFn!: (e: any) => void;

  const cleanup = async () => {
    try {
      processor.disconnect();
      source.disconnect();
    } catch {}
    stream.getTracks().forEach((t) => t.stop());
    try {
      await ctx.close();
    } catch {}
  };

  const finish = async () => {
    await cleanup();
    const wavBlob = floatToWavBlob(chunks, totalSamples, ctx.sampleRate, sampleRate);
    resolveFn(wavBlob);
  };

  const stopRequested = () => signal?.aborted === true;

  if (signal) {
    signal.addEventListener(
      "abort",
      () => {
        // stop now and return what we have
        finish();
      },
      { once: true }
    );
  }

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);

    chunks.push(copy);
    totalSamples += copy.length;

    // RMS volume
    let sum = 0;
    for (let i = 0; i < copy.length; i++) sum += copy[i] * copy[i];
    const rms = Math.sqrt(sum / copy.length);

    const now = performance.now();

    if (!speechStarted) {
      if (rms >= silenceThreshold) {
        speechStarted = true;
        silenceStart = 0;
      }
    } else {
      if (rms < silenceThreshold) {
        if (silenceStart === 0) silenceStart = now;
        if (now - silenceStart >= silenceMs) {
          // auto stop on silence
          finish();
          return;
        }
      } else {
        silenceStart = 0; // reset silence timer if user speaks again
      }
    }

    if (stopRequested()) return;

    if (now - startTs >= maxMs) {
      finish();
      return;
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination); // required for processor to run in some browsers

  return new Promise<Blob>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
}

function floatToWavBlob(
  chunks: Float32Array[],
  totalSamples: number,
  inRate: number,
  outRate: number
): Blob {
  // Merge
  const merged = new Float32Array(totalSamples);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  // Resample if needed
  const resampled = inRate === outRate ? merged : resampleLinear(merged, inRate, outRate);

  // Convert float [-1,1] to 16-bit PCM
  const pcm = new Int16Array(resampled.length);
  for (let i = 0; i < resampled.length; i++) {
    const s = Math.max(-1, Math.min(1, resampled[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  // WAV header
  const wavBuffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(wavBuffer);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(view, 8, "WAVE");

  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = 1
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true); // byte rate = sampleRate * channels * bytesPerSample
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  writeStr(view, 36, "data");
  view.setUint32(40, pcm.length * 2, true);

  // PCM data
  let p = 44;
  for (let i = 0; i < pcm.length; i++, p += 2) view.setInt16(p, pcm[i], true);

  return new Blob([wavBuffer], { type: "audio/wav" });
}

function writeStr(view: DataView, offset: number, s: string) {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

function resampleLinear(input: Float32Array, inRate: number, outRate: number) {
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    const t = i * ratio;
    const i0 = Math.floor(t);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = t - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}
