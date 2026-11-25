import {
  Bot,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserPlus,
} from "lucide-react";
import { INTONATION_PRESETS, VOICE_PERSONAS } from "../data/presets";
import type { DialogueLine, DialogueSpeakerConfig, VoiceId } from "../types/tts";
import { DialogueStatsBar } from "./DialogueStatsBar";

const SUGGESTED_SPEAKER_NAMES = [
  "Raka",
  "Nadia",
  "Bima",
  "Sari",
  "Dimas",
  "Tara",
];

interface DialogueEditorProps {
  speakers: DialogueSpeakerConfig[];
  onChangeSpeakers: (speakers: DialogueSpeakerConfig[]) => void;
  lines: DialogueLine[];
  onChangeLines: (lines: DialogueLine[]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onRequestAiReply: (options: {
    mode: "fill" | "replyAfter" | "appendNext";
    lineId?: string;
  }) => void;
  aiBusyLineId: string | null; // line.id or "append" when busy
}

export function DialogueEditor({
  speakers,
  onChangeSpeakers,
  lines,
  onChangeLines,
  onGenerate,
  isGenerating,
  onRequestAiReply,
  aiBusyLineId,
}: DialogueEditorProps) {
  const addSpeaker = () => {
    const nextIndex = speakers.length;
    const nextVoice =
      VOICE_PERSONAS[nextIndex % VOICE_PERSONAS.length]?.id ?? "Zephyr";
    const preset =
      INTONATION_PRESETS[nextIndex % INTONATION_PRESETS.length]?.stylePrompt ??
      INTONATION_PRESETS[0].stylePrompt;
    const baseName =
      SUGGESTED_SPEAKER_NAMES[nextIndex] || `Pembicara ${nextIndex + 1}`;
    const usedNames = new Set(speakers.map((s) => s.name.trim().toLowerCase()));
    const uniqueName = usedNames.has(baseName.toLowerCase())
      ? `Pembicara ${nextIndex + 1}`
      : baseName;

    const newSpeaker: DialogueSpeakerConfig = {
      id: `spk-${crypto.randomUUID().slice(0, 8)}`,
      name: uniqueName,
      voice: nextVoice,
      style: preset,
    };

    onChangeSpeakers([...speakers, newSpeaker]);
  };

  const updateSpeaker = (
    speakerId: string,
    patch: Partial<DialogueSpeakerConfig>
  ) => {
    onChangeSpeakers(
      speakers.map((s) => (s.id === speakerId ? { ...s, ...patch } : s))
    );
    if (typeof patch.name === "string") {
      onChangeLines(
        lines.map((l) =>
          l.speakerId === speakerId ? { ...l, speaker: patch.name! } : l
        )
      );
    }
  };

  const removeSpeaker = (speakerId: string) => {
    if (speakers.length <= 2) return;
    const remaining = speakers.filter((s) => s.id !== speakerId);
    const fallback = remaining[0];
    onChangeSpeakers(remaining);
    onChangeLines(
      lines.map((l) =>
        l.speakerId === speakerId
          ? { ...l, speakerId: fallback.id, speaker: fallback.name }
          : l
      )
    );
  };

  const addLine = () => {
    const lastLine = lines[lines.length - 1];
    const lastSpeakerIdx = lastLine
      ? speakers.findIndex((s) => s.id === lastLine.speakerId)
      : -1;
    const nextSpeaker =
      speakers[(lastSpeakerIdx + 1) % speakers.length] ?? speakers[0];

    onChangeLines([
      ...lines,
      {
        id: crypto.randomUUID(),
        speakerId: nextSpeaker.id,
        speaker: nextSpeaker.name,
        text: "",
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<DialogueLine>) => {
    onChangeLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const removeLine = (id: string) => {
    if (lines.length <= 1) return;
    onChangeLines(lines.filter((l) => l.id !== id));
  };

  const hasText = lines.some((l) => l.text.trim().length > 0);
  const namesMissing = speakers.some((s) => !s.name.trim());
  const normalizedNames = speakers.map((s) => s.name.trim().toLowerCase());
  const namesDuplicate =
    !namesMissing && new Set(normalizedNames).size !== normalizedNames.length;
  const isAiBusy = aiBusyLineId !== null;

  return (
    <div className="space-y-6">
      {/* Participants Header + Add Speaker */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Daftar Pembicara ({speakers.length} Orang)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Tambahkan peserta percakapan serta atur karakter vokal dan intonasi masing-masing.
            </p>
          </div>
          <button
            type="button"
            onClick={addSpeaker}
            disabled={speakers.length >= 6}
            className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Tambah Pembicara
          </button>
        </div>

        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          {speakers.map((sp, idx) => {
            const label = `Pembicara ${idx + 1}`;
            return (
              <div
                key={sp.id}
                className="border border-slate-200 rounded-xl p-4 space-y-3.5 bg-slate-50/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {label}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs text-slate-500">
                      Suara {sp.voice}
                    </span>
                  </div>

                  {speakers.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeSpeaker(sp.id)}
                      title={`Hapus ${sp.name || label}`}
                      className="h-7 px-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Nama Peran
                    </label>
                    <input
                      type="text"
                      value={sp.name}
                      onChange={(e) =>
                        updateSpeaker(sp.id, { name: e.target.value })
                      }
                      placeholder={label}
                      className="w-full h-9 px-3 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Karakter Vokal
                    </label>
                    <select
                      value={sp.voice}
                      onChange={(e) =>
                        updateSpeaker(sp.id, {
                          voice: e.target.value as VoiceId,
                        })
                      }
                      className="w-full h-9 px-2.5 text-xs font-medium text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                    >
                      {VOICE_PERSONAS.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.gender} · {v.character})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Arahan Intonasi {sp.name.trim() || label}
                  </label>
                  <select
                    value={
                      INTONATION_PRESETS.some((p) => p.stylePrompt === sp.style)
                        ? sp.style
                        : "custom"
                    }
                    onChange={(e) => {
                      if (e.target.value !== "custom") {
                        updateSpeaker(sp.id, { style: e.target.value });
                      }
                    }}
                    className="w-full h-9 px-2.5 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg mb-2 focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {INTONATION_PRESETS.map((p) => (
                      <option key={p.id} value={p.stylePrompt}>
                        {p.label}
                      </option>
                    ))}
                    <option value="custom">Kustom</option>
                  </select>
                  <input
                    type="text"
                    value={sp.style}
                    onChange={(e) =>
                      updateSpeaker(sp.id, { style: e.target.value })
                    }
                    placeholder="Atau tulis gaya intonasi khusus..."
                    className="w-full h-9 px-3 text-xs text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Script Lines */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Baris Percakapan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih pembicara pada setiap baris, atau klik tombol asisten AI untuk membuat tanggapan percakapan secara instan.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onRequestAiReply({ mode: "appendNext" })}
              disabled={isAiBusy || isGenerating}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {aiBusyLineId === "append" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
              Balas Otomatis AI
            </button>

            <button
              type="button"
              onClick={addLine}
              className="h-9 px-3.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Baris
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {lines.map((line, index) => {
            const activeSpeaker =
              speakers.find((s) => s.id === line.speakerId) ?? speakers[0];
            const speakerLabel =
              activeSpeaker?.name.trim() || `Pembicara ${index + 1}`;
            const isEmptyLine = !line.text.trim();
            const isBusyThisRow = aiBusyLineId === line.id;

            return (
              <div
                key={line.id}
                className="px-6 py-4 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex items-center gap-2 sm:w-48 shrink-0 pt-1">
                  <span className="text-xs font-mono tabular-nums text-slate-400 w-5">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <select
                    aria-label={`Pembicara baris ${index + 1}`}
                    value={activeSpeaker?.id ?? ""}
                    onChange={(e) => {
                      const chosen = speakers.find(
                        (s) => s.id === e.target.value
                      );
                      if (chosen) {
                        updateLine(line.id, {
                          speakerId: chosen.id,
                          speaker: chosen.name,
                        });
                      }
                    }}
                    className="flex-1 h-9 px-2.5 text-xs font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
                  >
                    {speakers.map((sp, spIdx) => (
                      <option key={sp.id} value={sp.id}>
                        {sp.name.trim() || `Pembicara ${spIdx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>

                <textarea
                  rows={2}
                  value={line.text}
                  onChange={(e) => updateLine(line.id, { text: e.target.value })}
                  placeholder={`Tulis dialog untuk ${speakerLabel}...`}
                  className="flex-1 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-slate-50/50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-y"
                />

                <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      onRequestAiReply({
                        mode: isEmptyLine ? "fill" : "replyAfter",
                        lineId: line.id,
                      })
                    }
                    disabled={isAiBusy || isGenerating}
                    title={
                      isEmptyLine
                        ? `Isi ucapan ${speakerLabel} otomatis dengan AI`
                        : "Buat balasan AI tepat di bawah baris ini"
                    }
                    className="h-9 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {isBusyThisRow ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Bot className="w-3.5 h-3.5" />
                    )}
                    {isEmptyLine ? "Isi AI" : "Balas AI"}
                  </button>

                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    disabled={lines.length <= 1}
                    title="Hapus baris"
                    className="h-9 w-9 inline-flex items-center justify-center text-slate-400 hover:text-red-600 disabled:opacity-30 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/40 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={addLine}
            className="h-9 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 hover:text-blue-700 hover:bg-blue-50/60 border border-dashed border-slate-300 hover:border-blue-300 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Baris Manual
          </button>

          <button
            type="button"
            onClick={() => onRequestAiReply({ mode: "appendNext" })}
            disabled={isAiBusy || isGenerating}
            className="h-9 inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-50/70 hover:bg-blue-100 border border-blue-200 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            {aiBusyLineId === "append" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bot className="w-3.5 h-3.5" />
            )}
            {aiBusyLineId === "append"
              ? "Asisten AI Menulis Tanggapan..."
              : "Buat Tanggapan Berikutnya (Asisten AI)"}
          </button>
        </div>

        <DialogueStatsBar speakers={speakers} lines={lines} />

        {(namesMissing || namesDuplicate) && (
          <div className="px-6 py-2.5 bg-amber-50 border-t border-amber-200 text-xs font-medium text-amber-800">
            {namesMissing
              ? "Lengkapi nama peran untuk semua pembicara terlebih dahulu."
              : "Nama setiap pembicara tidak boleh sama."}
          </div>
        )}

        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-500">
            <span>{speakers.length} pembicara</span>
            <span aria-hidden="true">·</span>
            <span>{lines.length} baris percakapan</span>
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={isGenerating || !hasText || namesMissing || namesDuplicate}
            className="h-10 px-5 inline-flex items-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses Percakapan...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Buat Audio Percakapan
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
