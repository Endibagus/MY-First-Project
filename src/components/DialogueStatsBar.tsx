import type { DialogueLine, DialogueSpeakerConfig } from "../types/tts";
import { formatTime } from "../utils/audioProcessor";

interface DialogueStatsBarProps {
  speakers: DialogueSpeakerConfig[];
  lines: DialogueLine[];
}

const SPEAKER_BAR_COLORS = [
  "bg-blue-600",
  "bg-slate-800",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-indigo-500",
  "bg-rose-600",
];

function countSpeakableWords(rawText: string): number {
  const cleaned = rawText
    .replace(/<[^>]+>/g, " ")
    .replace(/\|[^|]+\|/g, " ")
    .replace(/\.{3,}/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).length;
}

function estimateLineDurationSec(rawText: string): number {
  const words = countSpeakableWords(rawText);
  if (words === 0) return 0;
  // ~140 words/min (~2.33 words/sec) + pause cues
  const pauseMatches = rawText.match(/(\.\.\.|<breath>|<laugh>|<gasp>)/gi);
  const cueSeconds = pauseMatches ? pauseMatches.length * 0.35 : 0;
  return Math.max(0.8, words / 2.33 + cueSeconds);
}

export function DialogueStatsBar({ speakers, lines }: DialogueStatsBarProps) {
  const activeLines = lines.filter((l) => l.text.trim().length > 0);

  const perSpeakerStats = speakers.map((sp, idx) => {
    const spLines = activeLines.filter((l) => l.speakerId === sp.id);
    const words = spLines.reduce((sum, l) => sum + countSpeakableWords(l.text), 0);
    const speechSec = spLines.reduce(
      (sum, l) => sum + estimateLineDurationSec(l.text),
      0
    );
    return {
      id: sp.id,
      name: sp.name.trim() || `Pembicara ${idx + 1}`,
      voice: sp.voice,
      words,
      speechSec,
      colorClass: SPEAKER_BAR_COLORS[idx % SPEAKER_BAR_COLORS.length],
    };
  });

  const totalWords = perSpeakerStats.reduce((sum, s) => sum + s.words, 0);
  const totalChars = activeLines.reduce((sum, l) => sum + l.text.trim().length, 0);
  const turnGapsSec = activeLines.length > 1 ? (activeLines.length - 1) * 0.22 : 0;
  const totalDurationSec =
    perSpeakerStats.reduce((sum, s) => sum + s.speechSec, 0) + turnGapsSec;

  return (
    <div className="px-6 py-4 border-t border-slate-200 bg-slate-50/60 space-y-3.5">
      {/* Numeric Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-xs text-slate-500">Estimasi Durasi Total</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-semibold font-mono tabular-nums text-slate-900">
              {totalWords > 0 ? formatTime(Math.round(totalDurationSec)) : "00:00"}
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              ~{totalWords > 0 ? totalDurationSec.toFixed(1) : "0.0"} dtk
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">Jumlah Kata Diproses</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-semibold font-mono tabular-nums text-slate-900">
              {totalWords.toLocaleString("id-ID")} kata
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {totalChars.toLocaleString("id-ID")} karakter
            </span>
          </div>
        </div>

        <div>
          <div className="text-xs text-slate-500">Cakupan Percakapan</div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-lg font-semibold font-mono tabular-nums text-slate-900">
              {activeLines.length} baris aktif
            </span>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {perSpeakerStats.filter((s) => s.words > 0).length} dari{" "}
              {speakers.length} pembicara
            </span>
          </div>
        </div>
      </div>

      {/* Simple Proportional Bar Visualization */}
      <div>
        <div
          className="h-2.5 w-full rounded-sm bg-slate-200 overflow-hidden flex gap-px"
          role="img"
          aria-label="Distribusi porsi kata dan durasi per pembicara"
        >
          {totalWords > 0 &&
            perSpeakerStats.map((sp) => {
              if (sp.words === 0) return null;
              const pct = (sp.words / totalWords) * 100;
              return (
                <div
                  key={sp.id}
                  className={`${sp.colorClass} h-full transition-all duration-200`}
                  style={{ width: `${pct}%` }}
                  title={`${sp.name}: ${sp.words} kata (${Math.round(pct)}%)`}
                />
              );
            })}
        </div>

        {/* Unboxed inline speaker legend */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-600">
          {perSpeakerStats.map((sp) => {
            const pct =
              totalWords > 0 ? Math.round((sp.words / totalWords) * 100) : 0;
            return (
              <div key={sp.id} className="inline-flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-xs shrink-0 ${sp.colorClass}`}
                  aria-hidden="true"
                />
                <span className="font-medium text-slate-800">{sp.name}</span>
                <span className="font-mono tabular-nums text-slate-500">
                  {sp.words} kata ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
