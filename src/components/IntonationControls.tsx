import { Loader2, Volume2 } from "lucide-react";
import {
  CONTOUR_OPTIONS,
  EMPHASIS_OPTIONS,
  INTONATION_PRESETS,
  PACING_OPTIONS,
  VOICE_PERSONAS,
} from "../data/presets";
import type { IntonationConfig, TtsModelId, VoiceId } from "../types/tts";

interface IntonationControlsProps {
  selectedVoice: VoiceId;
  onSelectVoice: (voice: VoiceId) => void;
  intonation: IntonationConfig;
  onChangeIntonation: (updated: IntonationConfig) => void;
  model: TtsModelId;
  onChangeModel: (model: TtsModelId) => void;
  onPreviewVoice: (voice: VoiceId) => void;
  previewingVoice: VoiceId | null;
}

export function IntonationControls({
  selectedVoice,
  onSelectVoice,
  intonation,
  onChangeIntonation,
  model,
  onChangeModel,
  onPreviewVoice,
  previewingVoice,
}: IntonationControlsProps) {
  const updateField = <K extends keyof IntonationConfig>(
    key: K,
    value: IntonationConfig[K]
  ) => {
    onChangeIntonation({ ...intonation, [key]: value });
  };

  return (
    <aside className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
      {/* Section 1: Karakter Suara */}
      <div className="p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Karakter Suara
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Pilih timbral vokal dasar lalu dengarkan sampelnya.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {VOICE_PERSONAS.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            const isPreviewing = previewingVoice === voice.id;
            return (
              <div
                key={voice.id}
                onClick={() => onSelectVoice(voice.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectVoice(voice.id);
                  }
                }}
                className={`w-full text-left px-3.5 py-3 rounded-lg border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/60"
                    : "border-slate-200 hover:border-slate-300 bg-white"
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold text-slate-900">
                      {voice.name}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs text-slate-500">
                      {voice.gender}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs font-medium text-slate-700 truncate">
                      {voice.character}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                    {voice.description}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewVoice(voice.id);
                  }}
                  disabled={previewingVoice !== null}
                  title={`Dengar pratinjau suara ${voice.name}`}
                  className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:border-blue-400 hover:text-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isPreviewing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" />
                  )}
                  Tes
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Pengaturan Intonasi & Gaya Bicara */}
      <div className="p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Direksi Intonasi Suara
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Atur emosi, kontur nada kalimat, tempo, dan penekanan sesuai preferensi.
          </p>
        </div>

        {/* Preset Gaya */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            Gaya & Suasana Suara
          </label>
          <div className="grid grid-cols-2 gap-2">
            {INTONATION_PRESETS.map((preset) => {
              const active = intonation.presetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateField("presetId", preset.id)}
                  title={preset.description}
                  className={`px-3 py-2 text-left text-xs font-medium rounded-lg border transition-colors whitespace-nowrap truncate cursor-pointer ${
                    active
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {INTONATION_PRESETS.find((p) => p.id === intonation.presetId)?.description}
          </p>
        </div>

        {/* Kontur Intonasi */}
        <div>
          <label
            htmlFor="contour-select"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Kontur Nada (Alur Intonasi)
          </label>
          <select
            id="contour-select"
            value={intonation.contourId}
            onChange={(e) => updateField("contourId", e.target.value)}
            className="w-full h-9 px-3 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
          >
            {CONTOUR_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tempo & Penekanan */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="pacing-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Ritme Bicara AI
            </label>
            <select
              id="pacing-select"
              value={intonation.pacingId}
              onChange={(e) => updateField("pacingId", e.target.value)}
              className="w-full h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              {PACING_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="emphasis-select"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Penekanan Emosi
            </label>
            <select
              id="emphasis-select"
              value={intonation.emphasisId}
              onChange={(e) => updateField("emphasisId", e.target.value)}
              className="w-full h-9 px-2.5 text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 cursor-pointer"
            >
              {EMPHASIS_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Arahan Kustom */}
        <div>
          <label
            htmlFor="custom-direction"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Arahan Intonasi Kustom (Opsional)
          </label>
          <textarea
            id="custom-direction"
            rows={2}
            value={intonation.customDirection}
            onChange={(e) => updateField("customDirection", e.target.value)}
            placeholder="Contoh: Ucapkan kalimat pembuka dengan semangat, lalu turunkan nada dengan tenang pada bagian penutup."
            className="w-full px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white resize-none"
          />
        </div>

        {/* Pilihan Mesin Model */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Mode Mesin Sintesis
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => onChangeModel("gemini-3.8-flash-tts")}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                model === "gemini-3.8-flash-tts"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Ekspresif & Desain
            </button>
            <button
              type="button"
              onClick={() => onChangeModel("gemini-3.8-flash-lite-tts")}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                model === "gemini-3.8-flash-lite-tts"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Cepat & Ringan
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
