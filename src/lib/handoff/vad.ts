export type VadSegment = {
  s: number;
  e: number;
};

export type VadPcmOptions = {
  frameMs?: number;
  minSpeechMs?: number;
  hangoverMs?: number;
  threshold?: number;
  dynamicThresholdScale?: number;
};

export type VadPcmResult = {
  speechRatio: number;
  segments: VadSegment[];
  threshold: number;
  frameMs: number;
  sampleRate: number;
};

export type VadBlobResult = VadPcmResult & {
  pcmFloat32: Float32Array;
};

const DEFAULT_FRAME_MS = 30;
const DEFAULT_MIN_SPEECH_MS = 180;
const DEFAULT_HANGOVER_MS = 160;
const DEFAULT_THRESHOLD = 0.012;
const DEFAULT_DYNAMIC_SCALE = 2.8;
const DEFAULT_TARGET_SAMPLE_RATE = 16_000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1);
  return sorted[index];
}

function rms(slice: Float32Array, start: number, end: number) {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i += 1) {
    const v = slice[i];
    sum += v * v;
  }
  return Math.sqrt(sum / (end - start));
}

export function analyzeVadPcm(
  pcm: Float32Array,
  sampleRate: number,
  options?: VadPcmOptions
): VadPcmResult {
  if (!(pcm instanceof Float32Array) || pcm.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return {
      speechRatio: 0,
      segments: [],
      threshold: options?.threshold ?? DEFAULT_THRESHOLD,
      frameMs: options?.frameMs ?? DEFAULT_FRAME_MS,
      sampleRate: Math.max(1, Number(sampleRate) || DEFAULT_TARGET_SAMPLE_RATE),
    };
  }

  const frameMs = clamp(Math.round(options?.frameMs ?? DEFAULT_FRAME_MS), 10, 60);
  const minSpeechMs = clamp(Math.round(options?.minSpeechMs ?? DEFAULT_MIN_SPEECH_MS), 60, 2_000);
  const hangoverMs = clamp(Math.round(options?.hangoverMs ?? DEFAULT_HANGOVER_MS), 0, 1_000);
  const frameSize = Math.max(1, Math.round((sampleRate * frameMs) / 1_000));

  const frameRms: number[] = [];
  for (let i = 0; i < pcm.length; i += frameSize) {
    frameRms.push(rms(pcm, i, Math.min(pcm.length, i + frameSize)));
  }

  const noiseFloor = percentile(frameRms, 0.2);
  const dynamicScale = clamp(options?.dynamicThresholdScale ?? DEFAULT_DYNAMIC_SCALE, 1.2, 6);
  const threshold = Math.max(options?.threshold ?? DEFAULT_THRESHOLD, noiseFloor * dynamicScale);

  const speechFrames = frameRms.map((value) => value >= threshold && value > noiseFloor * 1.08);
  const expandFrames = Math.ceil(hangoverMs / frameMs);
  const expanded = new Array<boolean>(speechFrames.length).fill(false);
  speechFrames.forEach((isSpeech, index) => {
    if (!isSpeech) return;
    const start = Math.max(0, index - expandFrames);
    const end = Math.min(speechFrames.length - 1, index + expandFrames);
    for (let i = start; i <= end; i += 1) expanded[i] = true;
  });

  const minFrames = Math.max(1, Math.ceil(minSpeechMs / frameMs));
  const segments: VadSegment[] = [];
  let runStart = -1;
  for (let i = 0; i < expanded.length; i += 1) {
    if (expanded[i]) {
      if (runStart === -1) runStart = i;
      continue;
    }
    if (runStart === -1) continue;
    const runFrames = i - runStart;
    if (runFrames >= minFrames) {
      segments.push({
        s: (runStart * frameSize) / sampleRate,
        e: Math.min(pcm.length, i * frameSize) / sampleRate,
      });
    }
    runStart = -1;
  }
  if (runStart !== -1) {
    const runFrames = expanded.length - runStart;
    if (runFrames >= minFrames) {
      segments.push({
        s: (runStart * frameSize) / sampleRate,
        e: pcm.length / sampleRate,
      });
    }
  }

  const speechSamples = segments.reduce((acc, segment) => acc + Math.max(0, Math.round((segment.e - segment.s) * sampleRate)), 0);
  const speechRatio = clamp(speechSamples / Math.max(1, pcm.length), 0, 1);

  return {
    speechRatio,
    segments,
    threshold,
    frameMs,
    sampleRate,
  };
}

function getAudioContextCtor() {
  if (typeof window === "undefined") return null;
  return (window.AudioContext ?? (window as any).webkitAudioContext ?? null) as
    | (new (...args: any[]) => AudioContext)
    | null;
}

function mixDownToMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels <= 1) {
    const mono = buffer.getChannelData(0);
    return new Float32Array(mono);
  }
  const channelData = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const mono = new Float32Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    let sum = 0;
    for (let ch = 0; ch < channelData.length; ch += 1) {
      sum += channelData[ch][i] ?? 0;
    }
    mono[i] = sum / channelData.length;
  }
  return mono;
}

function resampleLinear(source: Float32Array, sourceRate: number, targetRate: number) {
  if (!source.length) return new Float32Array(0);
  if (sourceRate === targetRate) return source;
  const ratio = sourceRate / targetRate;
  const targetLength = Math.max(1, Math.round(source.length / ratio));
  const out = new Float32Array(targetLength);
  for (let i = 0; i < targetLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(source.length - 1, left + 1);
    const t = position - left;
    out[i] = (source[left] ?? 0) * (1 - t) + (source[right] ?? 0) * t;
  }
  return out;
}

export function isAudioDecodeSupported() {
  return Boolean(getAudioContextCtor());
}

export async function decodeBlobToMonoPcm(blob: Blob, targetSampleRate = DEFAULT_TARGET_SAMPLE_RATE) {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;

  const context = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const mono = mixDownToMono(decoded);
    const sampleRate = decoded.sampleRate;
    const targetRate = clamp(Math.round(targetSampleRate), 8_000, 48_000);
    const pcmFloat32 = resampleLinear(mono, sampleRate, targetRate);
    return {
      pcmFloat32,
      sampleRate: targetRate,
    };
  } catch {
    return null;
  } finally {
    try {
      await context.close();
    } catch {
      // noop
    }
  }
}

export async function analyzeVadFromBlob(
  blob: Blob,
  options?: VadPcmOptions & { targetSampleRate?: number }
): Promise<VadBlobResult | null> {
  const decoded = await decodeBlobToMonoPcm(blob, options?.targetSampleRate ?? DEFAULT_TARGET_SAMPLE_RATE);
  if (!decoded) return null;
  const vad = analyzeVadPcm(decoded.pcmFloat32, decoded.sampleRate, options);
  return {
    ...vad,
    pcmFloat32: decoded.pcmFloat32,
  };
}
