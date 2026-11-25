export type VoiceId = "Kore" | "Zephyr" | "Puck" | "Charon" | "Fenrir";

export type TtsModelId = "gemini-3.8-flash-tts" | "gemini-3.8-flash-lite-tts";

export type WorkspaceTab = "single" | "dialogue" | "history";

export type Mp3Bitrate = 128 | 192 | 320;

export interface VoicePersona {
  id: VoiceId;
  name: string;
  gender: "Wanita" | "Pria";
  character: string;
  description: string;
}

export interface IntonationPreset {
  id: string;
  label: string;
  description: string;
  stylePrompt: string;
}

export interface IntonationOption {
  id: string;
  label: string;
  promptValue: string;
}

export interface IntonationConfig {
  presetId: string;
  contourId: string;
  pacingId: string;
  emphasisId: string;
  customDirection: string;
}

export interface AcousticSettings {
  pitchSemitones: number; // -6 to +6
  speed: number; // 0.70 to 1.40
  warmthDb: number; // -6 to +6
  clarityDb: number; // -6 to +6
}

export interface DialogueSpeakerConfig {
  id: string;
  name: string;
  voice: VoiceId;
  style: string;
}

export interface DialogueLine {
  id: string;
  speakerId: string;
  speaker: string;
  text: string;
}

export interface GeneratedAudioClip {
  id: string;
  title: string;
  mode: "single" | "dialogue";
  scriptPreview: string;
  fullText: string;
  voiceSummary: string;
  styleSummary: string;
  model: string;
  audioBase64: string;
  durationSec: number;
  createdAt: number;
  acoustic: AcousticSettings;
}
