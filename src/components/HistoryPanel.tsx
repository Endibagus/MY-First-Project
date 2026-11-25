import { useState } from "react";
import { Download, Play, Search, Trash2 } from "lucide-react";
import type { GeneratedAudioClip, Mp3Bitrate } from "../types/tts";
import {
  decodeBase64WavToAudioBuffer,
  encodeAudioBufferToMp3Blob,
  formatTime,
  processAudioBuffer,
  triggerBlobDownload,
} from "../utils/audioProcessor";

interface HistoryPanelProps {
  clips: GeneratedAudioClip[];
  activeClipId: string | null;
  bitrate: Mp3Bitrate;
  onSelectClip: (clip: GeneratedAudioClip) => void;
  onDeleteClip: (id: string) => void;
  onGoToStudio: () => void;
}

export function HistoryPanel({
  clips,
  activeClipId,
  bitrate,
  onSelectClip,
  onDeleteClip,
  onGoToStudio,
}: HistoryPanelProps) {
  const [query, setQuery] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const filtered = clips.filter((clip) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      clip.title.toLowerCase().includes(q) ||
      clip.scriptPreview.toLowerCase().includes(q) ||
      clip.voiceSummary.toLowerCase().includes(q) ||
      clip.styleSummary.toLowerCase().includes(q)
    );
  });

  const handleDirectMp3 = async (clip: GeneratedAudioClip) => {
    setDownloadingId(clip.id);
    try {
      const ctx = new AudioContext();
      const decoded = await decodeBase64WavToAudioBuffer(clip.audioBase64, ctx);
      const tuned = await processAudioBuffer(decoded, clip.acoustic);
      const mp3Blob = encodeAudioBufferToMp3Blob(tuned, bitrate);
      const slug =
        clip.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 32) || "suara";
      triggerBlobDownload(mp3Blob, `suarastudio-${slug}-${bitrate}kbps.mp3`);
      await ctx.close();
    } catch (err) {
      console.error("Direct MP3 export failed:", err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Riwayat Audio Tersimpan
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Rekaman disimpan secara lokal di peramban Anda untuk diputar ulang atau diunduh kembali sebagai MP3.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari naskah atau suara..."
            className="w-full h-9 pl-9 pr-3 text-xs text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
          />
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">
            Belum ada riwayat suara yang dibuat.
          </p>
          <p className="text-xs text-slate-500 mt-1 mb-5">
            Setiap audio yang Anda hasilkan di Studio Tunggal atau Mode Dialog akan muncul di sini.
          </p>
          <button
            type="button"
            onClick={onGoToStudio}
            className="h-9 px-4 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
          >
            Buka Studio Suara
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="px-6 py-12 text-center text-xs text-slate-500">
          Tidak ditemukan audio yang cocok dengan kata kunci &ldquo;{query}&rdquo;.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((clip) => {
            const isActive = clip.id === activeClipId;
            const dateStr = new Intl.DateTimeFormat("id-ID", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(clip.createdAt));

            return (
              <div
                key={clip.id}
                className={`px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                  isActive ? "bg-blue-50/40" : "hover:bg-slate-50/70"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="truncate">{clip.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-1">
                    {clip.scriptPreview}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
                    <span>{clip.mode === "dialogue" ? "Dialog" : "Tunggal"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{clip.voiceSummary}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-xs">{clip.styleSummary}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {formatTime(clip.durationSec)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">{dateStr}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectClip(clip)}
                    className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:border-blue-400 hover:text-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Muat & Setel
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDirectMp3(clip)}
                    disabled={downloadingId === clip.id}
                    className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {downloadingId === clip.id ? "Menyimpan..." : "MP3"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteClip(clip.id)}
                    title="Hapus rekaman"
                    className="h-8 w-8 inline-flex items-center justify-center text-slate-400 hover:text-red-600 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
