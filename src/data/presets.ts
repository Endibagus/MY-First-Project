import type {
  AcousticSettings,
  IntonationOption,
  IntonationPreset,
  VoicePersona,
} from "../types/tts";

export const VOICE_PERSONAS: VoicePersona[] = [
  {
    id: "Kore",
    name: "Kore",
    gender: "Wanita",
    character: "Hangat & Jelas",
    description: "Artikulasi bersih, cocok untuk narasi edukasi, berita, dan panduan produk.",
  },
  {
    id: "Zephyr",
    name: "Zephyr",
    gender: "Wanita",
    character: "Cerah & Ekspresif",
    description: "Nada lincah dan modern, ideal untuk konten kreatif, promosi, dan podcast.",
  },
  {
    id: "Puck",
    name: "Puck",
    gender: "Pria",
    character: "Ramah & Energik",
    description: "Gaya percakapan santai dan akrab, pas untuk ulasan, dialog, dan media sosial.",
  },
  {
    id: "Charon",
    name: "Charon",
    gender: "Pria",
    character: "Dalam & Berwibawa",
    description: "Timbre berat dan tenang, kuat untuk dokumenter, audiobuku, dan narasi serius.",
  },
  {
    id: "Fenrir",
    name: "Fenrir",
    gender: "Pria",
    character: "Tegas & Dramatis",
    description: "Proyeksi vokal mantap dan berkarakter, cocok untuk pengumuman dan cerita epik.",
  },
];

export const INTONATION_PRESETS: IntonationPreset[] = [
  {
    id: "natural",
    label: "Alami & Jelas",
    description: "Penyampaian seimbang dan natural seperti pembacaan profesional.",
    stylePrompt: "Natural, clear, well-articulated studio voice with balanced intonation",
  },
  {
    id: "warm",
    label: "Ramah & Hangat",
    description: "Nada bersahabat, senyum terdengar dalam suara, nyaman didengar.",
    stylePrompt: "Warm, friendly, welcoming conversational tone with gentle inflection",
  },
  {
    id: "news",
    label: "Pembawa Berita",
    description: "Artikulasi presisi, ritme teratur, dan penekanan informasi yang objektif.",
    stylePrompt: "Crisp, authoritative broadcast news anchor with measured phrasing",
  },
  {
    id: "enthusiastic",
    label: "Antusias & Promosi",
    description: "Energi tinggi, nada naik dinamis untuk menarik perhatian pendengar.",
    stylePrompt: "Energetic, upbeat, enthusiastic commercial voice with bright emphasis",
  },
  {
    id: "calm",
    label: "Tenang & Meditatif",
    description: "Aliran napas rileks, intonasi lembut, cocok untuk relaksasi atau refleksi.",
    stylePrompt: "Soothing, calm, unhurried meditative tone with soft downward cadence",
  },
  {
    id: "dramatic",
    label: "Dramatis & Puitis",
    description: "Dinamika kontras tinggi dengan jeda emosional yang terasa mendalam.",
    stylePrompt: "Expressive, dramatic storytelling voice with rich emotional contrast",
  },
  {
    id: "authoritative",
    label: "Tegas & Otoritatif",
    description: "Nada mantap, meyakinkan, cocok untuk presentasi bisnis atau instruksi.",
    stylePrompt: "Confident, firm, persuasive executive voice with decisive sentence endings",
  },
  {
    id: "whisper",
    label: "Intim & Pelan",
    description: "Suara dekat mikrofon, lembut, berbisik halus untuk efek personal.",
    stylePrompt: "Soft, close-mic intimate voice, gentle hushed delivery",
  },
];

export const CONTOUR_OPTIONS: IntonationOption[] = [
  {
    id: "balanced",
    label: "Seimbang (Alami)",
    promptValue: "natural balanced pitch melody across phrases",
  },
  {
    id: "rising",
    label: "Naik (Antusias / Bertanya)",
    promptValue: "upward rising inflection on key phrases conveying curiosity and openness",
  },
  {
    id: "falling",
    label: "Turun (Tegas / Meyakinkan)",
    promptValue: "grounded downward cadence at sentence endings for certainty and authority",
  },
  {
    id: "dynamic",
    label: "Dinamis (Ekspresif)",
    promptValue: "wide dynamic pitch contour with expressive peaks and valleys",
  },
];

export const PACING_OPTIONS: IntonationOption[] = [
  {
    id: "slow",
    label: "Lambat & Terukur",
    promptValue: "deliberate, slower pacing with clear pauses between clauses",
  },
  {
    id: "normal",
    label: "Normal",
    promptValue: "natural conversational speaking speed",
  },
  {
    id: "fast",
    label: "Cepat & Lincah",
    promptValue: "brisk, lively speaking tempo with crisp transitions",
  },
];

export const EMPHASIS_OPTIONS: IntonationOption[] = [
  {
    id: "minimal",
    label: "Kalem (Minimal)",
    promptValue: "subtle, restrained vocal stress",
  },
  {
    id: "moderate",
    label: "Moderat",
    promptValue: "clear natural emphasis on important words",
  },
  {
    id: "high",
    label: "Tinggi (Kuat)",
    promptValue: "strong expressive stress and vivid vocal coloring on key words",
  },
];

export const EXPRESSION_CUES = [
  { label: "Jeda (...)", token: " ... ", title: "Tambahkan jeda bicara alami" },
  { label: "Tarik Napas", token: " <breath> ", title: "Sisipkan tarikan napas realistis" },
  { label: "Tawa Ringan", token: " <laugh> ", title: "Sisipkan tawa ringan" },
  { label: "Terkesiap", token: " <gasp> ", title: "Sisipkan ekspresi kaget/terkesiap" },
];

export const SAMPLE_SCRIPTS = [
  {
    id: "podcast",
    label: "Pembuka Podcast",
    presetId: "warm",
    text: "Selamat datang kembali di ruang cerita sore ini. <breath> Pernahkah Anda merasa waktu berjalan terlalu cepat saat kita sibuk mengejar target harian? ... Hari ini, kita akan berhenti sejenak dan membahas cara menata ulang fokus tanpa kehilangan ketenangan.",
  },
  {
    id: "promo",
    label: "Iklan Produk",
    presetId: "enthusiastic",
    text: "Kini hadir kopi seduh dingin dengan racikan biji pilihan dari dataran tinggi Gayo! Rasakan aroma karamel yang lembut dan kesegaran instan di setiap tegukan. ... Pesan sekarang dan nikmati potongan khusus hari ini!",
  },
  {
    id: "news",
    label: "Laporan Berita",
    presetId: "news",
    text: "Selamat pagi pemirsa. Pengembangan transportasi ramah lingkungan di kawasan perkotaan terus menunjukkan tren positif sepanjang tahun ini. Sejumlah rute baru bus listrik resmi beroperasi guna memangkas emisi sekaligus meningkatkan kenyamanan penumpang.",
  },
  {
    id: "story",
    label: "Narasi Cerita",
    presetId: "dramatic",
    text: "Kabut tipis mulai turun menyelimuti dermaga tua itu. <breath> Dari kejauhan, suara lonceng kapal terdengar samar... seolah mengingatkan bahwa perjalanan panjang baru saja akan dimulai.",
  },
];

export const DEFAULT_ACOUSTIC_SETTINGS: AcousticSettings = {
  pitchSemitones: 0,
  speed: 1.0,
  warmthDb: 0,
  clarityDb: 0,
};
