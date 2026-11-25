import { Mp3Encoder } from "@breezystack/lamejs";
import type { AcousticSettings, Mp3Bitrate } from "../types/tts";

export function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function decodeBase64WavToAudioBuffer(
  base64: string,
  audioCtx: BaseAudioContext
): Promise<AudioBuffer> {
  const arrayBuffer = decodeBase64ToArrayBuffer(base64);
  return await audioCtx.decodeAudioData(arrayBuffer);
}

/**
 * Waveform Similarity Overlap-Add (WSOLA) time-scaler.
 * Scales duration by `stretchFactor` (>1 = longer, <1 = shorter) without changing pitch.
 */
function wsolaTimeScale(input: Float32Array, stretchFactor: number): Float32Array {
  if (Math.abs(stretchFactor - 1.0) < 0.002 || input.length < 2048) {
    return input;
  }

  const winSize = 1024;
  const halfWin = winSize >> 1;
  const synthHop = 256;
  const searchRadius = 128;

  // Precompute Hann window
  const hann = new Float32Array(winSize);
  for (let i = 0; i < winSize; i++) {
    hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (winSize - 1)));
  }

  const outputLength = Math.max(winSize, Math.round(input.length * stretchFactor));
  const output = new Float32Array(outputLength);
  const norm = new Float32Array(outputLength);

  // Copy first frame cleanly
  for (let i = 0; i < winSize && i < input.length && i < outputLength; i++) {
    output[i] += input[i] * hann[i];
    norm[i] += hann[i];
  }

  let outPos = synthHop;
  let prevInPos = 0;

  while (outPos + winSize < outputLength) {
    const targetInPos = Math.round(outPos / stretchFactor);
    if (targetInPos + winSize >= input.length) break;

    // Reference template from natural continuation of previous frame
    const natPos = prevInPos + synthHop;
    let bestOffset = 0;
    let bestCorr = -Infinity;

    if (natPos + halfWin < input.length) {
      const startDelta = Math.max(-searchRadius, -targetInPos);
      const endDelta = Math.min(searchRadius, input.length - winSize - targetInPos);

      for (let delta = startDelta; delta <= endDelta; delta += 2) {
        const candPos = targetInPos + delta;
        let corr = 0;
        for (let j = 0; j < halfWin; j += 2) {
          corr += input[natPos + j] * input[candPos + j];
        }
        if (corr > bestCorr) {
          bestCorr = corr;
          bestOffset = delta;
        }
      }
    }

    const chosenInPos = Math.max(
      0,
      Math.min(input.length - winSize, targetInPos + bestOffset)
    );

    for (let i = 0; i < winSize; i++) {
      output[outPos + i] += input[chosenInPos + i] * hann[i];
      norm[outPos + i] += hann[i];
    }

    prevInPos = chosenInPos;
    outPos += synthHop;
  }

  for (let i = 0; i < outputLength; i++) {
    if (norm[i] > 1e-5) {
      output[i] /= norm[i];
    }
  }

  return output;
}

/**
 * Linear/cubic resampler: resampling by `ratio` (>1 shifts pitch UP and shortens).
 */
function resampleBuffer(input: Float32Array, ratio: number): Float32Array {
  if (Math.abs(ratio - 1.0) < 0.002) {
    return input;
  }
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  const maxIdx = input.length - 1;

  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const s0 = input[Math.min(maxIdx, idx)];
    const s1 = input[Math.min(maxIdx, idx + 1)];
    out[i] = s0 + (s1 - s0) * frac;
  }

  return out;
}

/**
 * Applies independent Pitch (semitones), Speed, Warmth EQ, Clarity EQ, and gentle peak limiting.
 */
export async function processAudioBuffer(
  source: AudioBuffer,
  settings: AcousticSettings
): Promise<AudioBuffer> {
  const sampleRate = source.sampleRate;
  const pitchRatio = Math.pow(2, settings.pitchSemitones / 12);
  const speed = Math.max(0.5, Math.min(2.0, settings.speed));

  const needsTimePitch =
    Math.abs(settings.pitchSemitones) > 0.05 || Math.abs(speed - 1.0) > 0.01;
  const needsEq =
    Math.abs(settings.warmthDb) > 0.1 || Math.abs(settings.clarityDb) > 0.1;

  const numChannels = source.numberOfChannels;
  const processedChannels: Float32Array[] = [];

  for (let ch = 0; ch < numChannels; ch++) {
    const raw = source.getChannelData(ch);
    if (!needsTimePitch) {
      processedChannels.push(new Float32Array(raw));
    } else {
      const stretchFactor = pitchRatio / speed;
      const stretched = wsolaTimeScale(raw, stretchFactor);
      const resampled = resampleBuffer(stretched, pitchRatio);
      processedChannels.push(resampled);
    }
  }

  const outLength = processedChannels[0].length;
  const tempCtx = new OfflineAudioContext(numChannels, outLength, sampleRate);
  const intermediateBuffer = tempCtx.createBuffer(numChannels, outLength, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    intermediateBuffer.copyToChannel(
      processedChannels[ch] as Float32Array<ArrayBuffer>,
      ch
    );
  }

  if (!needsEq) {
    return intermediateBuffer;
  }

  const srcNode = tempCtx.createBufferSource();
  srcNode.buffer = intermediateBuffer;

  const lowShelf = tempCtx.createBiquadFilter();
  lowShelf.type = "lowshelf";
  lowShelf.frequency.value = 220;
  lowShelf.gain.value = settings.warmthDb;

  const presencePeak = tempCtx.createBiquadFilter();
  presencePeak.type = "peaking";
  presencePeak.frequency.value = 3200;
  presencePeak.Q.value = 1.1;
  presencePeak.gain.value = settings.clarityDb;

  const compressor = tempCtx.createDynamicsCompressor();
  compressor.threshold.value = -3;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;

  srcNode.connect(lowShelf);
  lowShelf.connect(presencePeak);
  presencePeak.connect(compressor);
  compressor.connect(tempCtx.destination);

  srcNode.start(0);
  return await tempCtx.startRendering();
}

function floatTo16BitPCM(floatSamples: Float32Array): Int16Array {
  const int16 = new Int16Array(floatSamples.length);
  for (let i = 0; i < floatSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

/**
 * Encodes an AudioBuffer into a real downloadable MP3 Blob using @breezystack/lamejs.
 */
export function encodeAudioBufferToMp3Blob(
  audioBuffer: AudioBuffer,
  kbps: Mp3Bitrate = 192
): Blob {
  const channels = Math.min(2, audioBuffer.numberOfChannels);
  const sampleRate = audioBuffer.sampleRate;
  const encoder = new Mp3Encoder(channels, sampleRate, kbps);

  const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const right =
    channels === 2 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : undefined;

  const blockSize = 1152;
  const mp3Chunks: Uint8Array[] = [];

  for (let i = 0; i < left.length; i += blockSize) {
    const leftChunk = left.subarray(i, i + blockSize);
    const mp3Buf = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + blockSize))
      : encoder.encodeBuffer(leftChunk);
    if (mp3Buf.length > 0) {
      mp3Chunks.push(new Uint8Array(mp3Buf));
    }
  }

  const endBuf = encoder.flush();
  if (endBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(endBuf));
  }

  const totalLength = mp3Chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of mp3Chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return new Blob([merged], { type: "audio/mp3" });
}

export function encodeAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1; // PCM
  const bitsPerSample = 16;

  const samplesLength = audioBuffer.length * numChannels;
  const dataByteLength = samplesLength * 2;
  const buffer = new ArrayBuffer(44 + dataByteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataByteLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, "data");
  view.setUint32(40, dataByteLength, true);

  let offset = 44;
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export function extractWaveformPeaks(
  audioBuffer: AudioBuffer,
  barCount = 96
): number[] {
  const channel = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channel.length / barCount));
  const peaks: number[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = i * step;
    const end = Math.min(channel.length, start + step);
    let maxVal = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j]);
      if (abs > maxVal) maxVal = abs;
    }
    peaks.push(maxVal);
  }

  const globalMax = Math.max(...peaks, 0.01);
  return peaks.map((p) => Math.max(0.08, p / globalMax));
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
