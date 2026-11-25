import { useEffect, useRef, useState } from "react";
import {
  Download,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { DEFAULT_ACOUSTIC_SETTINGS } from "../data/presets";
import type {
  AcousticSettings,
  GeneratedAudioClip,
  Mp3Bitrate,
} from "../types/tts";
import {
  decodeBase64WavToAudioBuffer,
  encodeAudioBufferToMp3Blob,
  encodeAudioBufferToWavBlob,
  extractWaveformPeaks,
  formatTime,
  processAudioBuffer,
  triggerBlobDownload,
} from "../utils/audioProcessor";

interface WaveformPlayerProps {
  clip: GeneratedAudioClip | null;
  acoustic: AcousticSettings;
  onChangeAcoustic: (settings: AcousticSettings) => void;
  bitrate: Mp3Bitrate;
  onChangeBitrate: (bitrate: Mp3Bitrate) => void;
  isGenerating: boolean;
}

export function WaveformPlayer({
  clip,
  acoustic,
  onChangeAcoustic,
  bitrate,
  onChangeBitrate,
  isGenerating,
}: WaveformPlayerProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rawBufferRef = useRef<AudioBuffer | null>(null);
  const processedBufferRef = useRef<AudioBuffer | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startWallTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);

  const [peaks, setPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isProcessingDsp, setIsProcessingDsp] = useState(false);
  const [isExportingMp3, setIsExportingMp3] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  };

  const stopPlayback = (resetOffset = false) => {
    if (activeSourceRef.current) {
      try {
        activeSourceRef.current.onended = null;
        activeSourceRef.current.stop();
        activeSourceRef.current.disconnect();
      } catch {
        // Ignore already stopped
      }
      activeSourceRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
    if (resetOffset) {
      pauseOffsetRef.current = 0;
      setCurrentTime(0);
    }
  };

  // Decode raw WAV whenever clip changes
  useEffect(() => {
    let cancelled = false;
    stopPlayback(true);
    rawBufferRef.current = null;
    processedBufferRef.current = null;

    if (!clip) {
      setPeaks([]);
      setDuration(0);
      return;
    }

    (async () => {
      try {
        setIsProcessingDsp(true);
        const ctx = getAudioCtx();
        const decoded = await decodeBase64WavToAudioBuffer(clip.audioBase64, ctx);
        if (cancelled) return;
        rawBufferRef.current = decoded;
        const tuned = await processAudioBuffer(decoded, acoustic);
        if (cancelled) return;
        processedBufferRef.current = tuned;
        setDuration(tuned.duration);
        setPeaks(extractWaveformPeaks(tuned, 88));
      } catch (err) {
        console.error("Audio decode error:", err);
      } finally {
        if (!cancelled) setIsProcessingDsp(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally triggered on clip?.id change; acoustic changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id]);

  // Re-apply DSP when acoustic sliders change (debounced slightly for smooth dragging)
  useEffect(() => {
    if (!rawBufferRef.current) return;
    let cancelled = false;
    const wasPlaying = isPlaying;

    const timer = setTimeout(async () => {
      if (!rawBufferRef.current) return;
      setIsProcessingDsp(true);
      try {
        const tuned = await processAudioBuffer(rawBufferRef.current, acoustic);
        if (cancelled) return;
        processedBufferRef.current = tuned;
        setDuration(tuned.duration);
        setPeaks(extractWaveformPeaks(tuned, 88));
        if (pauseOffsetRef.current > tuned.duration) {
          pauseOffsetRef.current = 0;
          setCurrentTime(0);
        }
        if (wasPlaying) {
          startPlaybackFrom(pauseOffsetRef.current);
        }
      } finally {
        if (!cancelled) setIsProcessingDsp(false);
      }
    }, 90);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acoustic.pitchSemitones, acoustic.speed, acoustic.warmthDb, acoustic.clarityDb]);

  useEffect(() => {
    return () => {
      stopPlayback(true);
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  const startPlaybackFrom = async (offsetSec: number) => {
    const buffer = processedBufferRef.current;
    if (!buffer) return;

    stopPlayback(false);
    const ctx = getAudioCtx();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const safeOffset = Math.max(0, Math.min(offsetSec, Math.max(0, buffer.duration - 0.02)));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    startWallTimeRef.current = ctx.currentTime - safeOffset;
    pauseOffsetRef.current = safeOffset;
    activeSourceRef.current = source;

    source.onended = () => {
      if (activeSourceRef.current === source) {
        activeSourceRef.current = null;
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        setIsPlaying(false);
        pauseOffsetRef.current = 0;
        setCurrentTime(0);
      }
    };

    source.start(0, safeOffset);
    setIsPlaying(true);

    const tick = () => {
      if (!activeSourceRef.current || !audioCtxRef.current) return;
      const elapsed = audioCtxRef.current.currentTime - startWallTimeRef.current;
      pauseOffsetRef.current = elapsed;
      setCurrentTime(Math.min(buffer.duration, elapsed));
      if (elapsed < buffer.duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const togglePlay = () => {
    if (!processedBufferRef.current) return;
    if (isPlaying) {
      if (audioCtxRef.current) {
        pauseOffsetRef.current = Math.max(
          0,
          audioCtxRef.current.currentTime - startWallTimeRef.current
        );
      }
      stopPlayback(false);
    } else {
      startPlaybackFrom(pauseOffsetRef.current);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!processedBufferRef.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * duration;
    pauseOffsetRef.current = targetSec;
    setCurrentTime(targetSec);
    if (isPlaying) {
      startPlaybackFrom(targetSec);
    }
  };

  const handleDownloadMp3 = async () => {
    if (!rawBufferRef.current || !clip) return;
    setIsExportingMp3(true);
    setExportSuccessMsg(null);
    try {
      const finalBuffer =
        processedBufferRef.current ??
        (await processAudioBuffer(rawBufferRef.current, acoustic));
      const mp3Blob = encodeAudioBufferToMp3Blob(finalBuffer, bitrate);
      const safeSlug = clip.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 32) || "suara";
      triggerBlobDownload(mp3Blob, `suarastudio-${safeSlug}-${bitrate}kbps.mp3`);
      setExportSuccessMsg(`File MP3 (${bitrate} kbps) berhasil diunduh.`);
      setTimeout(() => setExportSuccessMsg(null), 4000);
    } catch (err) {
      console.error("MP3 export error:", err);
    } finally {
      setIsExportingMp3(false);
    }
  };

  const handleDownloadWav = async () => {
    if (!rawBufferRef.current || !clip) return;
    const finalBuffer =
      processedBufferRef.current ??
      (await processAudioBuffer(rawBufferRef.current, acoustic));
    const wavBlob = encodeAudioBufferToWavBlob(finalBuffer);
    const safeSlug = clip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || "suara";
    triggerBlobDownload(wavBlob, `suarastudio-${safeSlug}.wav`);
  };

  const isAcousticDefault =
    acoustic.pitchSemitones === 0 &&
    acoustic.speed === 1.0 &&
    acoustic.warmthDb === 0 &&
    acoustic.clarityDb === 0;

  const progressRatio = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Top Mastering Header */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Pemutar & Penyetelan Intonasi Akustik
          </h2>
          {clip ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span className="font-medium text-slate-700">{clip.voiceSummary}</span>
              <span aria-hidden="true">·</span>
              <span className="truncate max-w-xs">{clip.styleSummary}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">24 kHz</span>
            </div>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">
              Buat suara terlebih dahulu untuk memutar gelombang audio, menyetel nada/kecepatan, dan mengunduh MP3.
            </p>
          )}
        </div>

        {clip && (
          <div className="flex items-center gap-2 shrink-0">
            <select
              aria-label="Kualitas Bitrate MP3"
              value={bitrate}
              onChange={(e) => onChangeBitrate(Number(e.target.value) as Mp3Bitrate)}
              className="h-9 px-2.5 text-xs font-mono font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              <option value={128}>128 kbps</option>
              <option value={192}>192 kbps</option>
              <option value={320}>320 kbps</option>
            </select>

            <button
              type="button"
              onClick={handleDownloadWav}
              disabled={isProcessingDsp}
              className="h-9 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              WAV
            </button>

            <button
              type="button"
              onClick={handleDownloadMp3}
              disabled={isExportingMp3 || isProcessingDsp}
              className="h-9 px-4 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isExportingMp3 ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Unduh MP3
            </button>
          </div>
        )}
      </div>

      {/* Dark Acoustic Waveform Deck */}
      <div className="bg-slate-900 px-6 py-5">
        {isGenerating ? (
          <div className="h-24 flex flex-col items-center justify-center text-slate-300 gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            <span className="text-xs font-medium">
              Menyintesis suara dengan arahan intonasi Anda...
            </span>
          </div>
        ) : !clip ? (
          <div className="h-24 flex items-center justify-center text-slate-400 text-xs">
            Belum ada audio yang dihasilkan. Tekan &ldquo;Buat Suara&rdquo; untuk memulai.
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={togglePlay}
              disabled={isProcessingDsp}
              aria-label={isPlaying ? "Jeda audio" : "Putar audio"}
              className="w-11 h-11 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {isProcessingDsp ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5 ml-0.5" />
              )}
            </button>

            {/* Interactive Waveform Bars */}
            <div
              onClick={handleWaveformClick}
              role="slider"
              aria-label="Posisi pemutaran audio"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
              tabIndex={0}
              className="flex-1 h-16 flex items-center gap-[3px] cursor-pointer select-none py-1"
            >
              {peaks.map((peak, idx) => {
                const barRatio = idx / Math.max(1, peaks.length - 1);
                const passed = barRatio <= progressRatio;
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-sm transition-colors duration-75 ${
                      passed ? "bg-blue-400" : "bg-slate-600 hover:bg-slate-500"
                    }`}
                    style={{
                      height: `${Math.round(peak * 100)}%`,
                      minHeight: "4px",
                    }}
                  />
                );
              })}
            </div>

            <div className="text-xs font-mono tabular-nums text-slate-300 whitespace-nowrap shrink-0">
              <span className="text-white">{formatTime(currentTime)}</span>
              <span className="text-slate-500 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Real-time DSP Intonation & Acoustic Sculpting */}
      <div className="p-6 bg-white">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Sliders className="w-3.5 h-3.5 text-blue-600" />
            Penala Nada & Akustik Real-Time (Tersimpan ke MP3)
          </div>

          {!isAcousticDefault && (
            <button
              type="button"
              onClick={() => onChangeAcoustic(DEFAULT_ACOUSTIC_SETTINGS)}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Netral
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Pitch */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="dsp-pitch" className="font-medium text-slate-700">
                Nada (Pitch)
              </label>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {acoustic.pitchSemitones > 0 ? "+" : ""}
                {acoustic.pitchSemitones.toFixed(1)} st
              </span>
            </div>
            <input
              id="dsp-pitch"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              value={acoustic.pitchSemitones}
              onChange={(e) =>
                onChangeAcoustic({
                  ...acoustic,
                  pitchSemitones: Number(e.target.value),
                })
              }
              className="w-full studio-slider"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Lebih Berat</span>
              <span>Lebih Tinggi</span>
            </div>
          </div>

          {/* Speed */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="dsp-speed" className="font-medium text-slate-700">
                Kecepatan Putar
              </label>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {acoustic.speed.toFixed(2)}x
              </span>
            </div>
            <input
              id="dsp-speed"
              type="range"
              min={0.7}
              max={1.4}
              step={0.05}
              value={acoustic.speed}
              onChange={(e) =>
                onChangeAcoustic({ ...acoustic, speed: Number(e.target.value) })
              }
              className="w-full studio-slider"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>0.70x Lambat</span>
              <span>1.40x Cepat</span>
            </div>
          </div>

          {/* Warmth */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="dsp-warmth" className="font-medium text-slate-700">
                Kehangatan Vokal
              </label>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {acoustic.warmthDb > 0 ? "+" : ""}
                {acoustic.warmthDb.toFixed(1)} dB
              </span>
            </div>
            <input
              id="dsp-warmth"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              value={acoustic.warmthDb}
              onChange={(e) =>
                onChangeAcoustic({
                  ...acoustic,
                  warmthDb: Number(e.target.value),
                })
              }
              className="w-full studio-slider"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Tipis</span>
              <span>Hangat</span>
            </div>
          </div>

          {/* Clarity */}
          <div>
            <div className="flex items-center justify-between text-xs mb-2">
              <label htmlFor="dsp-clarity" className="font-medium text-slate-700">
                Kejelasan Artikulasi
              </label>
              <span className="font-mono tabular-nums text-slate-900 font-medium">
                {acoustic.clarityDb > 0 ? "+" : ""}
                {acoustic.clarityDb.toFixed(1)} dB
              </span>
            </div>
            <input
              id="dsp-clarity"
              type="range"
              min={-6}
              max={6}
              step={0.5}
              value={acoustic.clarityDb}
              onChange={(e) =>
                onChangeAcoustic({
                  ...acoustic,
                  clarityDb: Number(e.target.value),
                })
              }
              className="w-full studio-slider"
            />
            <div className="flex justify-between text-[11px] text-slate-400 mt-1">
              <span>Lembut</span>
              <span>Tajam</span>
            </div>
          </div>
        </div>

        {exportSuccessMsg && (
          <div className="mt-4 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800">
            {exportSuccessMsg}
          </div>
        )}
      </div>
    </section>
  );
}
