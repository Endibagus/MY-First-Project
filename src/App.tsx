import { useEffect, useRef, useState } from "react";
import { AlertCircle, Download, Sparkles, X } from "lucide-react";
import { DialogueEditor } from "./components/DialogueEditor";
import { HistoryPanel } from "./components/HistoryPanel";
import { IntonationControls } from "./components/IntonationControls";
import { ScriptEditor } from "./components/ScriptEditor";
import { WaveformPlayer } from "./components/WaveformPlayer";
import {
  CONTOUR_OPTIONS,
  DEFAULT_ACOUSTIC_SETTINGS,
  EMPHASIS_OPTIONS,
  INTONATION_PRESETS,
  PACING_OPTIONS,
  SAMPLE_SCRIPTS,
} from "./data/presets";
import type {
  AcousticSettings,
  DialogueLine,
  DialogueSpeakerConfig,
  GeneratedAudioClip,
  IntonationConfig,
  Mp3Bitrate,
  TtsModelId,
  VoiceId,
  WorkspaceTab,
} from "./types/tts";
import {
  decodeBase64WavToAudioBuffer,
  encodeAudioBufferToMp3Blob,
  processAudioBuffer,
  triggerBlobDownload,
} from "./utils/audioProcessor";
import {
  deleteClipFromDb,
  loadSavedClips,
  saveClipToDb,
} from "./utils/historyDb";

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("single");

  // Single-speaker studio state
  const [scriptText, setScriptText] = useState<string>(SAMPLE_SCRIPTS[0].text);
  const [selectedVoice, setSelectedVoice] = useState<VoiceId>("Kore");
  const [model, setModel] = useState<TtsModelId>("gemini-3.8-flash-lite-tts");
  const [intonation, setIntonation] = useState<IntonationConfig>({
    presetId: "warm",
    contourId: "balanced",
    pacingId: "normal",
    emphasisId: "moderate",
    customDirection: "",
  });

  // Multi-speaker dialogue state
  const [dialogueSpeakers, setDialogueSpeakers] = useState<
    DialogueSpeakerConfig[]
  >([
    {
      id: "spk-1",
      name: "Raka",
      voice: "Puck",
      style: INTONATION_PRESETS[1].stylePrompt,
    },
    {
      id: "spk-2",
      name: "Nadia",
      voice: "Kore",
      style: INTONATION_PRESETS[0].stylePrompt,
    },
  ]);
  const [dialogueLines, setDialogueLines] = useState<DialogueLine[]>([
    {
      id: "line-1",
      speakerId: "spk-1",
      speaker: "Raka",
      text: "Selamat pagi semuanya! <breath> Hari ini kita akan membahas cara mengatur intonasi suara agar terdengar lebih hidup.",
    },
    {
      id: "line-2",
      speakerId: "spk-2",
      speaker: "Nadia",
      text: "|yeah| Betul sekali, Raka. Perubahan kecil pada jeda dan penekanan kata bisa membuat pesan terasa jauh lebih meyakinkan.",
    },
  ]);

  // Playback, DSP & History state
  const [acoustic, setAcoustic] = useState<AcousticSettings>(
    DEFAULT_ACOUSTIC_SETTINGS
  );
  const [bitrate, setBitrate] = useState<Mp3Bitrate>(192);
  const [activeClip, setActiveClip] = useState<GeneratedAudioClip | null>(null);
  const [historyClips, setHistoryClips] = useState<GeneratedAudioClip[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [aiBusyLineId, setAiBusyLineId] = useState<string | null>(null);
  const [isExportingTop, setIsExportingTop] = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<VoiceId | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    loadSavedClips().then((clips) => {
      setHistoryClips(clips);
    });
  }, []);

  // Persist acoustic tuning changes onto the active clip in history
  useEffect(() => {
    if (!activeClip) return;
    const updatedClip: GeneratedAudioClip = { ...activeClip, acoustic };
    setHistoryClips((prev) =>
      prev.map((c) => (c.id === updatedClip.id ? updatedClip : c))
    );
    const timer = setTimeout(() => {
      saveClipToDb(updatedClip);
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acoustic, activeClip?.id]);

  const getWavDurationSeconds = async (base64: string): Promise<number> => {
    try {
      const ctx = new AudioContext();
      const buf = await decodeBase64WavToAudioBuffer(base64, ctx);
      const dur = buf.duration;
      await ctx.close();
      return dur;
    } catch {
      return 0;
    }
  };

  const buildSingleIntonationPayload = () => {
    const preset = INTONATION_PRESETS.find((p) => p.id === intonation.presetId);
    const contour = CONTOUR_OPTIONS.find((c) => c.id === intonation.contourId);
    const pacing = PACING_OPTIONS.find((p) => p.id === intonation.pacingId);
    const emphasis = EMPHASIS_OPTIONS.find((e) => e.id === intonation.emphasisId);

    return {
      styleLabel: preset?.stylePrompt || "",
      contour: contour?.promptValue || "",
      pacing: pacing?.promptValue || "",
      emphasis: emphasis?.promptValue || "",
      customDirection: intonation.customDirection,
      displaySummary: [preset?.label, contour?.label.split(" ")[0]]
        .filter(Boolean)
        .join(" · "),
    };
  };

  const handleGenerateSingle = async () => {
    if (!scriptText.trim()) return;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const payloadIntonation = buildSingleIntonationPayload();
      const res = await fetch("/api/tts/single", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scriptText.trim(),
          voiceName: selectedVoice,
          model,
          intonation: {
            styleLabel: payloadIntonation.styleLabel,
            contour: payloadIntonation.contour,
            pacing: payloadIntonation.pacing,
            emphasis: payloadIntonation.emphasis,
            customDirection: payloadIntonation.customDirection,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memproses permintaan suara.");
      }

      const durationSec = await getWavDurationSeconds(data.audioBase64);
      const cleanPreview = scriptText.replace(/<[^>]+>|\|[^|]+\|/g, "").trim();
      const titleSnippet =
        cleanPreview.split(/\s+/).slice(0, 6).join(" ") || "Rekaman Suara";

      const newClip: GeneratedAudioClip = {
        id: crypto.randomUUID(),
        title: titleSnippet,
        mode: "single",
        scriptPreview: cleanPreview.slice(0, 140),
        fullText: scriptText,
        voiceSummary: selectedVoice,
        styleSummary: payloadIntonation.displaySummary || "Alami & Jelas",
        model: data.model || model,
        audioBase64: data.audioBase64,
        durationSec,
        createdAt: Date.now(),
        acoustic: { ...acoustic },
      };

      setActiveClip(newClip);
      setHistoryClips((prev) => [newClip, ...prev]);
      await saveClipToDb(newClip);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Terjadi kesalahan saat menyintesis suara."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDialogue = async () => {
    const validLines = dialogueLines.filter((l) => l.text.trim().length > 0);
    if (validLines.length === 0) return;
    setErrorMessage(null);
    setIsGenerating(true);

    try {
      const res = await fetch("/api/tts/dialogue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakers: dialogueSpeakers,
          lines: validLines,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal membuat audio percakapan.");
      }

      const durationSec = await getWavDurationSeconds(data.audioBase64);
      const joined = validLines.map((l) => `${l.speaker}: ${l.text}`).join(" ");
      const speakerNames = dialogueSpeakers.map((s) => s.name.trim()).filter(Boolean);
      const voiceSummary = Array.from(
        new Set(dialogueSpeakers.map((s) => s.voice))
      ).join(" · ");

      const newClip: GeneratedAudioClip = {
        id: crypto.randomUUID(),
        title: `Dialog ${speakerNames.join(", ")}`,
        mode: "dialogue",
        scriptPreview: joined.slice(0, 140),
        fullText: joined,
        voiceSummary,
        styleSummary: `Dialog ${dialogueSpeakers.length} Pembicara`,
        model: data.model || "gemini-3.8-flash-lite-tts",
        audioBase64: data.audioBase64,
        durationSec,
        createdAt: Date.now(),
        acoustic: { ...acoustic },
      };

      setActiveClip(newClip);
      setHistoryClips((prev) => [newClip, ...prev]);
      await saveClipToDb(newClip);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat menyintesis percakapan."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRequestAiReply = async ({
    mode,
    lineId,
  }: {
    mode: "fill" | "replyAfter" | "appendNext";
    lineId?: string;
  }) => {
    if (dialogueSpeakers.length === 0) return;
    setErrorMessage(null);
    const busyKey = mode === "appendNext" ? "append" : lineId || "append";
    setAiBusyLineId(busyKey);

    try {
      let targetSpeaker = dialogueSpeakers[0];
      let contextLines = dialogueLines;
      let insertAfterIndex = dialogueLines.length - 1;

      if (mode === "fill" && lineId) {
        const idx = dialogueLines.findIndex((l) => l.id === lineId);
        const line = idx >= 0 ? dialogueLines[idx] : undefined;
        targetSpeaker =
          dialogueSpeakers.find((s) => s.id === line?.speakerId) ??
          dialogueSpeakers[0];
        contextLines = idx >= 0 ? dialogueLines.slice(0, idx) : dialogueLines;
      } else if (mode === "replyAfter" && lineId) {
        const idx = dialogueLines.findIndex((l) => l.id === lineId);
        const line = idx >= 0 ? dialogueLines[idx] : undefined;
        const curSpeakerIdx = dialogueSpeakers.findIndex(
          (s) => s.id === line?.speakerId
        );
        targetSpeaker =
          dialogueSpeakers[(curSpeakerIdx + 1) % dialogueSpeakers.length] ??
          dialogueSpeakers[0];
        contextLines = idx >= 0 ? dialogueLines.slice(0, idx + 1) : dialogueLines;
        insertAfterIndex = idx >= 0 ? idx : dialogueLines.length - 1;
      } else {
        const lastLine = dialogueLines[dialogueLines.length - 1];
        const lastIdx = lastLine
          ? dialogueSpeakers.findIndex((s) => s.id === lastLine.speakerId)
          : -1;
        targetSpeaker =
          dialogueSpeakers[(lastIdx + 1) % dialogueSpeakers.length] ??
          dialogueSpeakers[0];
      }

      const res = await fetch("/api/dialogue/suggest-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          speakers: dialogueSpeakers,
          historyLines: contextLines,
          targetSpeakerId: targetSpeaker.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Asisten AI gagal membuat tanggapan percakapan."
        );
      }

      const replyText = String(data.reply || "").trim();
      if (!replyText) return;

      if (mode === "fill" && lineId) {
        setDialogueLines((prev) =>
          prev.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  speakerId: targetSpeaker.id,
                  speaker: targetSpeaker.name,
                  text: replyText,
                }
              : l
          )
        );
      } else {
        const newLine: DialogueLine = {
          id: crypto.randomUUID(),
          speakerId: targetSpeaker.id,
          speaker: targetSpeaker.name,
          text: replyText,
        };
        setDialogueLines((prev) => {
          if (mode === "replyAfter" && lineId) {
            const idx = prev.findIndex((l) => l.id === lineId);
            const pos = idx >= 0 ? idx + 1 : insertAfterIndex + 1;
            const copy = [...prev];
            copy.splice(pos, 0, newLine);
            return copy;
          }
          return [...prev, newLine];
        });
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Gagal meminta tanggapan dari asisten AI."
      );
    } finally {
      setAiBusyLineId(null);
    }
  };

  const handlePreviewVoice = async (voice: VoiceId) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setErrorMessage(null);
    setPreviewingVoice(voice);

    try {
      const preset = INTONATION_PRESETS.find((p) => p.id === intonation.presetId);
      const res = await fetch("/api/tts/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          voiceName: voice,
          stylePrompt: preset?.stylePrompt || "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal memutar pratinjau suara.");
      }

      const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
      previewAudioRef.current = audio;
      await audio.play();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Pratinjau suara gagal diputar."
      );
    } finally {
      setPreviewingVoice(null);
    }
  };

  const handleSelectSample = (sampleId: string) => {
    const sample = SAMPLE_SCRIPTS.find((s) => s.id === sampleId);
    if (!sample) return;
    setScriptText(sample.text);
    setIntonation((prev) => ({ ...prev, presetId: sample.presetId }));
  };

  const handleLoadHistoryClip = (clip: GeneratedAudioClip) => {
    setActiveClip(clip);
    setAcoustic(clip.acoustic || DEFAULT_ACOUSTIC_SETTINGS);
    if (clip.mode === "single") {
      setScriptText(clip.fullText);
      setActiveTab("single");
    } else {
      setActiveTab("dialogue");
    }
  };

  const handleDeleteHistoryClip = async (id: string) => {
    await deleteClipFromDb(id);
    setHistoryClips((prev) => prev.filter((c) => c.id !== id));
    if (activeClip?.id === id) {
      setActiveClip(null);
    }
  };

  const handleTopBarExportMp3 = async () => {
    if (!activeClip) {
      if (activeTab === "dialogue") {
        await handleGenerateDialogue();
      } else {
        if (activeTab === "history") setActiveTab("single");
        await handleGenerateSingle();
      }
      return;
    }

    setIsExportingTop(true);
    try {
      const ctx = new AudioContext();
      const decoded = await decodeBase64WavToAudioBuffer(
        activeClip.audioBase64,
        ctx
      );
      const tuned = await processAudioBuffer(decoded, acoustic);
      const mp3Blob = encodeAudioBufferToMp3Blob(tuned, bitrate);
      const slug =
        activeClip.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "suara";
      triggerBlobDownload(mp3Blob, `suarastudio-${slug}-${bitrate}kbps.mp3`);
      await ctx.close();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Gagal mengekspor file MP3."
      );
    } finally {
      setIsExportingTop(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 on desktop */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 sm:gap-8">
          {/* Zone 1: Single-element Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab("single");
            }}
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            SuaraStudio
          </a>

          {/* Zone 2: Clean single-line navigation links */}
          <nav
            aria-label="Navigasi utama"
            className="flex items-center gap-3 sm:gap-6 text-xs sm:text-sm font-medium overflow-x-auto"
          >
            <button
              type="button"
              onClick={() => setActiveTab("single")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "single"
                  ? "border-blue-600 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              Studio Tunggal
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("dialogue")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "dialogue"
                  ? "border-blue-600 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              Mode Dialog
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === "history"
                  ? "border-blue-600 text-slate-900 font-semibold"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              Riwayat{" "}
              <span className="font-mono tabular-nums text-xs text-slate-400 ml-1">
                {historyClips.length}
              </span>
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={handleTopBarExportMp3}
              disabled={isGenerating || isExportingTop}
              className="h-9 px-4 inline-flex items-center gap-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {activeClip ? (
                <>
                  <Download className="w-3.5 h-3.5" />
                  {isExportingTop ? "Mengekspor..." : "Unduh MP3"}
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Buat Suara
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Page Heading */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              {activeTab === "single"
                ? "Studio Sintesis Suara & Intonasi"
                : activeTab === "dialogue"
                ? "Studio Percakapan Multi-Pembicara"
                : "Arsip Rekaman Suara"}
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl">
              {activeTab === "single"
                ? "Ubah naskah teks menjadi suara manusia yang ekspresif, sesuaikan kontur intonasi, nada, serta kecepatan secara langsung, lalu unduh dalam format MP3."
                : activeTab === "dialogue"
                ? "Tambahkan beberapa pembicara sekaligus, susun baris percakapan dengan intonasi berbeda tiap orang, dan ekspor langsung ke MP3."
                : "Putar ulang, setel ulang intonasi akustik, atau ekspor kembali rekaman yang pernah Anda buat."}
            </p>
          </div>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 flex items-start justify-between gap-3 text-xs text-red-800"
          >
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span className="leading-relaxed font-medium">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Tutup pesan kesalahan"
              className="text-red-500 hover:text-red-800 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Workspace Views */}
        {activeTab === "single" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-6">
              <ScriptEditor
                text={scriptText}
                onChange={setScriptText}
                onSelectSample={handleSelectSample}
                onGenerate={handleGenerateSingle}
                isGenerating={isGenerating}
              />

              <WaveformPlayer
                clip={activeClip}
                acoustic={acoustic}
                onChangeAcoustic={setAcoustic}
                bitrate={bitrate}
                onChangeBitrate={setBitrate}
                isGenerating={isGenerating}
              />
            </div>

            <div className="lg:col-span-5">
              <IntonationControls
                selectedVoice={selectedVoice}
                onSelectVoice={setSelectedVoice}
                intonation={intonation}
                onChangeIntonation={setIntonation}
                model={model}
                onChangeModel={setModel}
                onPreviewVoice={handlePreviewVoice}
                previewingVoice={previewingVoice}
              />
            </div>
          </div>
        )}

        {activeTab === "dialogue" && (
          <div className="space-y-6">
            <DialogueEditor
              speakers={dialogueSpeakers}
              onChangeSpeakers={setDialogueSpeakers}
              lines={dialogueLines}
              onChangeLines={setDialogueLines}
              onGenerate={handleGenerateDialogue}
              isGenerating={isGenerating}
              onRequestAiReply={handleRequestAiReply}
              aiBusyLineId={aiBusyLineId}
            />

            <WaveformPlayer
              clip={activeClip}
              acoustic={acoustic}
              onChangeAcoustic={setAcoustic}
              bitrate={bitrate}
              onChangeBitrate={setBitrate}
              isGenerating={isGenerating}
            />
          </div>
        )}

        {activeTab === "history" && (
          <HistoryPanel
            clips={historyClips}
            activeClipId={activeClip?.id ?? null}
            bitrate={bitrate}
            onSelectClip={handleLoadHistoryClip}
            onDeleteClip={handleDeleteHistoryClip}
            onGoToStudio={() => setActiveTab("single")}
          />
        )}
      </main>

      {/* Quiet minimal footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>SuaraStudio · Sintesis Teks ke Suara & Penyetelan Intonasi</span>
          <span>Format ekspor MP3 (128 / 192 / 320 kbps) & WAV</span>
        </div>
      </footer>
    </div>
  );
}
