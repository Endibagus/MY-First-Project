import { useRef } from "react";
import { Loader2, Sparkles, Eraser } from "lucide-react";
import { EXPRESSION_CUES, SAMPLE_SCRIPTS } from "../data/presets";

interface ScriptEditorProps {
  text: string;
  onChange: (value: string) => void;
  onSelectSample: (sampleId: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}

export function ScriptEditor({
  text,
  onChange,
  onSelectSample,
  onGenerate,
  isGenerating,
}: ScriptEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const insertCue = (token: string) => {
    const el = textareaRef.current;
    if (!el) {
      onChange(text + token);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const updated = text.slice(0, start) + token + text.slice(end);
    onChange(updated);
    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + token.length;
      el.setSelectionRange(cursor, cursor);
    });
  };

  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const charCount = text.length;
  const estSeconds = Math.max(1, Math.round((wordCount / 140) * 60));

  return (
    <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Naskah Teks
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Tulis teks Bahasa Indonesia atau multibahasa, lalu sisipkan penanda ekspresi bila perlu.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sample-script" className="sr-only">
            Muat contoh naskah
          </label>
          <select
            id="sample-script"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                onSelectSample(e.target.value);
                e.target.value = "";
              }
            }}
            className="h-9 px-3 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
          >
            <option value="" disabled>
              Muat Contoh Naskah...
            </option>
            {SAMPLE_SCRIPTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          {text.length > 0 && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="h-9 px-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Bersihkan teks"
            >
              <Eraser className="w-3.5 h-3.5" />
              Bersihkan
            </button>
          )}
        </div>
      </div>

      {/* Quick expression cues toolbar */}
      <div className="px-6 py-2.5 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500 mr-1 whitespace-nowrap">
          Sisipkan Penanda:
        </span>
        {EXPRESSION_CUES.map((cue) => (
          <button
            key={cue.token}
            type="button"
            onClick={() => insertCue(cue.token)}
            title={cue.title}
            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:border-blue-400 hover:text-blue-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {cue.label}
          </button>
        ))}
      </div>

      {/* Textarea */}
      <div className="p-6">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => onChange(e.target.value)}
          maxLength={5000}
          rows={7}
          placeholder="Ketik atau tempel naskah yang ingin diubah menjadi suara di sini..."
          className="w-full resize-y min-h-[180px] text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
        />
      </div>

      {/* Footer stats & Generate CTA */}
      <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
          <span>{charCount.toLocaleString("id-ID")} / 5.000 karakter</span>
          <span aria-hidden="true">·</span>
          <span>{wordCount.toLocaleString("id-ID")} kata</span>
          <span aria-hidden="true">·</span>
          <span>Estimasi ~{wordCount > 0 ? estSeconds : 0} dtk</span>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating || !trimmed}
          className="h-10 px-5 inline-flex items-center justify-center gap-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Memproses Suara...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Buat Suara
            </>
          )}
        </button>
      </div>
    </section>
  );
}
