import "dotenv/config";
import express, { type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_VOICES = new Set(["Puck", "Charon", "Kore", "Fenrir", "Zephyr"]);
const VALID_MODELS = new Set(["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"]);

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("MISSING_API_KEY");
  }
  return new GoogleGenAI({
    apiKey,
    apiVersion: "v1beta",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function buildIntonationStylePrompt(params: {
  styleLabel?: string;
  contour?: string;
  pacing?: string;
  emphasis?: string;
  customDirection?: string;
}): string {
  const segments: string[] = [];

  if (params.styleLabel?.trim()) {
    segments.push(params.styleLabel.trim());
  }
  if (params.contour?.trim()) {
    segments.push(`Intonation contour: ${params.contour.trim()}`);
  }
  if (params.pacing?.trim()) {
    segments.push(`Speaking pace: ${params.pacing.trim()}`);
  }
  if (params.emphasis?.trim()) {
    segments.push(`Emotional emphasis: ${params.emphasis.trim()}`);
  }
  if (params.customDirection?.trim()) {
    segments.push(`Additional vocal direction: ${params.customDirection.trim()}`);
  }

  return segments.length > 0
    ? segments.join(". ")
    : "Natural, clear, well-paced vocal delivery";
}

function isQuotaOrRateError(err: unknown): boolean {
  const raw = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    raw.includes("resource_exhausted") ||
    raw.includes("429") ||
    raw.includes("quota")
  );
}

function formatApiError(err: unknown): { status: number; message: string } {
  if (err instanceof Error && err.message === "MISSING_API_KEY") {
    return {
      status: 500,
      message:
        "Kunci API Gemini belum tersedia di server. Pastikan GEMINI_API_KEY dikonfigurasi di Settings > Secrets.",
    };
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  if (
    lower.includes("permission_denied") ||
    lower.includes("api_key_invalid") ||
    lower.includes("403")
  ) {
    return {
      status: 403,
      message:
        "Akses API ditolak atau kunci API tidak valid. Periksa pengaturan kunci di Settings > Secrets.",
    };
  }
  if (isQuotaOrRateError(err)) {
    const isDailyLimit =
      lower.includes("per day") ||
      lower.includes("requestsperday") ||
      lower.includes("free_tier");
    return {
      status: 429,
      message: isDailyLimit
        ? "Kuota harian Free Tier (10 permintaan/hari untuk model suara) telah tercapai. Gunakan kunci API berbayar di panel Settings > Secrets untuk kuota lebih besar, atau coba lagi setelah kuota harian direset."
        : "Batas permintaan per menit sedang penuh. Tunggu beberapa saat lalu coba lagi, atau gunakan kunci API berbayar di Settings > Secrets.",
    };
  }
  if (lower.includes("not_found") || lower.includes("404")) {
    return {
      status: 404,
      message: `Model atau endpoint suara tidak ditemukan: ${rawMsg}`,
    };
  }

  return {
    status: 500,
    message: `Gagal menghasilkan suara: ${rawMsg}`,
  };
}

/**
 * Extracts raw PCM bytes and audio format metadata from a RIFF/WAVE buffer,
 * skipping any non-PCM trailing metadata chunks (such as C2PA jumb chunks).
 */
function extractWavPcm(wavBuffer: Buffer): {
  pcm: Buffer;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
} {
  if (
    wavBuffer.length < 44 ||
    wavBuffer.toString("ascii", 0, 4) !== "RIFF" ||
    wavBuffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return {
      pcm: wavBuffer,
      sampleRate: 24000,
      numChannels: 1,
      bitsPerSample: 16,
    };
  }

  let sampleRate = 24000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let pcm = wavBuffer.subarray(44);

  let offset = 12;
  while (offset + 8 <= wavBuffer.length) {
    const chunkId = wavBuffer.toString("ascii", offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(wavBuffer.length, dataStart + chunkSize);

    if (chunkId === "fmt " && chunkSize >= 16) {
      numChannels = wavBuffer.readUInt16LE(dataStart + 2);
      sampleRate = wavBuffer.readUInt32LE(dataStart + 4);
      bitsPerSample = wavBuffer.readUInt16LE(dataStart + 14);
    } else if (chunkId === "data") {
      pcm = wavBuffer.subarray(dataStart, dataEnd);
      break;
    }

    // RIFF chunks are word-aligned (even byte boundary)
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return { pcm, sampleRate, numChannels, bitsPerSample };
}

function buildWavFromPcm(
  pcmChunks: Buffer[],
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16,
  gapMs = 200
): Buffer {
  const bytesPerSample = (bitsPerSample / 8) * numChannels;
  const silenceBytes = Math.round((sampleRate * (gapMs / 1000)) * bytesPerSample);
  const silenceBuf = Buffer.alloc(silenceBytes);

  const stitchedParts: Buffer[] = [];
  pcmChunks.forEach((chunk, index) => {
    stitchedParts.push(chunk);
    if (index < pcmChunks.length - 1 && silenceBytes > 0) {
      stitchedParts.push(silenceBuf);
    }
  });

  const pcmData = Buffer.concat(stitchedParts);
  const header = Buffer.alloc(44);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmData.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * bytesPerSample, 28);
  header.writeUInt16LE(bytesPerSample, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmData.length, 40);

  return Buffer.concat([header, pcmData]);
}

function sanitizeTextForLiteTts(text: string): string {
  return text
    .replace(/<breath>/gi, " ... ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\|([^|]+)\|/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function synthesizeSingleClip(
  ai: GoogleGenAI,
  params: {
    model: string;
    text: string;
    style: string;
    voiceName: string;
  }
): Promise<string> {
  const response = await ai.models.generateContent({
    model: params.model,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: params.text,
            speechMetadata: {
              style: params.style,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: params.voiceName,
          },
        },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  );
  if (!part?.inlineData?.data) {
    throw new Error("Model tidak mengembalikan data audio.");
  }
  return part.inlineData.data;
}

async function synthesizeWithAutoFallback(
  ai: GoogleGenAI,
  params: {
    preferredModel: string;
    text: string;
    style: string;
    voiceName: string;
  }
): Promise<{ audioBase64: string; model: string }> {
  const alternateModel =
    params.preferredModel === "gemini-3.8-flash-tts"
      ? "gemini-3.8-flash-lite-tts"
      : "gemini-3.8-flash-tts";

  try {
    const textForModel =
      params.preferredModel === "gemini-3.8-flash-lite-tts"
        ? sanitizeTextForLiteTts(params.text) || params.text
        : params.text;
    const audioBase64 = await synthesizeSingleClip(ai, {
      model: params.preferredModel,
      text: textForModel,
      style: params.style,
      voiceName: params.voiceName,
    });
    return { audioBase64, model: params.preferredModel };
  } catch (err) {
    if (!isQuotaOrRateError(err)) {
      throw err;
    }
    const textForAlt =
      alternateModel === "gemini-3.8-flash-lite-tts"
        ? sanitizeTextForLiteTts(params.text) || params.text
        : params.text;
    const audioBase64 = await synthesizeSingleClip(ai, {
      model: alternateModel,
      text: textForAlt,
      style: params.style,
      voiceName: params.voiceName,
    });
    return { audioBase64, model: alternateModel };
  }
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  // Single-speaker TTS with intonation direction
  app.post("/api/tts/single", async (req: Request, res: Response) => {
    try {
      const {
        text,
        voiceName = "Kore",
        model = "gemini-3.8-flash-lite-tts",
        intonation = {},
      } = req.body ?? {};

      if (typeof text !== "string" || !text.trim()) {
        res.status(400).json({ error: "Teks naskah tidak boleh kosong." });
        return;
      }

      if (text.trim().length > 5000) {
        res.status(400).json({ error: "Maksimal panjang naskah adalah 5.000 karakter." });
        return;
      }

      const safeVoice = VALID_VOICES.has(voiceName) ? voiceName : "Kore";
      const preferredModel = VALID_MODELS.has(model)
        ? model
        : "gemini-3.8-flash-lite-tts";
      const stylePrompt = buildIntonationStylePrompt(intonation);
      const ai = getAiClient();

      const result = await synthesizeWithAutoFallback(ai, {
        preferredModel,
        text: text.trim(),
        style: stylePrompt,
        voiceName: safeVoice,
      });

      res.json({
        audioBase64: result.audioBase64,
        mimeType: "audio/wav",
        sampleRate: 24000,
        voiceName: safeVoice,
        model: result.model,
        appliedStyle: stylePrompt,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Quick voice audition preview (uses fast high-throughput model with fallback)
  app.post("/api/tts/preview", async (req: Request, res: Response) => {
    try {
      const { voiceName = "Kore", stylePrompt = "" } = req.body ?? {};
      const safeVoice = VALID_VOICES.has(voiceName) ? voiceName : "Kore";
      const sampleText =
        "Halo, ini adalah pratinjau karakter suara saya dengan pengaturan intonasi pilihan Anda.";

      const ai = getAiClient();
      const result = await synthesizeWithAutoFallback(ai, {
        preferredModel: "gemini-3.8-flash-lite-tts",
        text: sampleText,
        style:
          typeof stylePrompt === "string" && stylePrompt.trim()
            ? stylePrompt.trim()
            : "Natural, warm, clear Indonesian studio voice",
        voiceName: safeVoice,
      });

      res.json({
        audioBase64: result.audioBase64,
        mimeType: "audio/wav",
        voiceName: safeVoice,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Multi-speaker dialogue TTS (supports 2+ speakers; uses native multiSpeakerVoiceConfig for 2 speakers with turn-by-turn WAV stitching for 3+ or quota fallback)
  app.post("/api/tts/dialogue", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const rawSpeakers: Array<{ id?: string; name?: string; voice?: string; style?: string }> =
        Array.isArray(body.speakers) && body.speakers.length > 0
          ? body.speakers
          : [body.speaker1, body.speaker2].filter(Boolean);

      const lines = body.lines;

      if (rawSpeakers.length < 2) {
        res.status(400).json({ error: "Minimal diperlukan 2 pembicara dalam percakapan." });
        return;
      }

      const normalizedSpeakers = rawSpeakers.map((sp, idx) => ({
        id: typeof sp?.id === "string" && sp.id ? sp.id : `spk-${idx + 1}`,
        name: typeof sp?.name === "string" ? sp.name.trim() : "",
        voice: VALID_VOICES.has(sp?.voice ?? "") ? (sp.voice as string) : "Kore",
        style:
          typeof sp?.style === "string" && sp.style.trim()
            ? sp.style.trim()
            : "Natural expressive conversational voice",
      }));

      if (normalizedSpeakers.some((sp) => !sp.name)) {
        res.status(400).json({ error: "Nama semua pembicara wajib diisi." });
        return;
      }

      const nameSet = new Set(normalizedSpeakers.map((sp) => sp.name.toLowerCase()));
      if (nameSet.size !== normalizedSpeakers.length) {
        res.status(400).json({ error: "Nama setiap pembicara harus berbeda." });
        return;
      }

      if (!Array.isArray(lines) || lines.length === 0) {
        res.status(400).json({ error: "Tambahkan minimal satu baris percakapan." });
        return;
      }

      const validLines = lines.filter(
        (l) => typeof l?.text === "string" && l.text.trim().length > 0
      );
      if (validLines.length === 0) {
        res.status(400).json({ error: "Isi teks percakapan tidak boleh kosong." });
        return;
      }

      const resolvedLines = validLines.map(
        (line: { speakerId?: string; speakerSlot?: number; speaker?: string; text: string }) => {
          let matched =
            (line.speakerId && normalizedSpeakers.find((s) => s.id === line.speakerId)) ||
            (typeof line.speakerSlot === "number" && normalizedSpeakers[line.speakerSlot - 1]) ||
            (typeof line.speaker === "string" &&
              normalizedSpeakers.find((s) => s.name === line.speaker?.trim()));

          if (!matched) {
            matched = normalizedSpeakers[0];
          }

          return {
            speakerId: matched.id,
            speakerName: matched.name,
            voice: matched.voice,
            style: matched.style,
            text: line.text.trim(),
          };
        }
      );

      const distinctUsedSpeakerIds = new Set(resolvedLines.map((l) => l.speakerId));
      const ai = getAiClient();

      // Native 2-speaker screenplay path when exactly 2 speakers are configured & used
      if (normalizedSpeakers.length === 2 && distinctUsedSpeakerIds.size === 2) {
        try {
          const [sp1, sp2] = normalizedSpeakers;
          const parts = resolvedLines.map((l) => ({
            text: `${l.speakerName}: ${l.text}`,
            speechMetadata: {
              speaker: l.speakerName,
              style: l.style,
            },
          }));

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash-tts",
            contents: [{ role: "user", parts }],
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                multiSpeakerVoiceConfig: {
                  speakerVoiceConfigs: [
                    {
                      speaker: sp1.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: sp1.voice } },
                    },
                    {
                      speaker: sp2.name,
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: sp2.voice } },
                    },
                  ],
                },
              },
            },
          });

          const base64Audio =
            response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)
              ?.inlineData?.data;

          if (base64Audio) {
            res.json({
              audioBase64: base64Audio,
              mimeType: "audio/wav",
              sampleRate: 24000,
              model: "gemini-3.8-flash-tts",
              speakerCount: 2,
            });
            return;
          }
        } catch (primaryErr) {
          if (!isQuotaOrRateError(primaryErr)) {
            throw primaryErr;
          }
          // Fall through to turn-by-turn WAV stitching on Free Tier quota limit
        }
      }

      // Multi-speaker (3+ participants) or fallback turn-by-turn synthesis + WAV stitching.
      // Merge consecutive lines by the same speaker to minimize API calls.
      const mergedTurns: typeof resolvedLines = [];
      for (const line of resolvedLines) {
        const prev = mergedTurns[mergedTurns.length - 1];
        if (prev && prev.speakerId === line.speakerId) {
          prev.text = `${prev.text} ... ${line.text}`;
        } else {
          mergedTurns.push({ ...line });
        }
      }

      const pcmTurns: Buffer[] = [];
      let outSampleRate = 24000;
      let outChannels = 1;
      let outBits = 16;
      let lastUsedModel = "gemini-3.8-flash-lite-tts";

      for (const turn of mergedTurns) {
        const result = await synthesizeWithAutoFallback(ai, {
          preferredModel: "gemini-3.8-flash-lite-tts",
          text: turn.text,
          style: turn.style,
          voiceName: turn.voice,
        });
        lastUsedModel = result.model;
        const wavBuf = Buffer.from(result.audioBase64, "base64");
        const parsed = extractWavPcm(wavBuf);
        outSampleRate = parsed.sampleRate;
        outChannels = parsed.numChannels;
        outBits = parsed.bitsPerSample;
        pcmTurns.push(parsed.pcm);
      }

      const stitchedWav = buildWavFromPcm(
        pcmTurns,
        outSampleRate,
        outChannels,
        outBits,
        220
      );

      res.json({
        audioBase64: stitchedWav.toString("base64"),
        mimeType: "audio/wav",
        sampleRate: outSampleRate,
        model: lastUsedModel,
        speakerCount: normalizedSpeakers.length,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Instant AI assistant reply generator for dialogue mode
  app.post("/api/dialogue/suggest-reply", async (req: Request, res: Response) => {
    try {
      const { speakers, historyLines, targetSpeakerId } = req.body ?? {};

      if (!Array.isArray(speakers) || speakers.length === 0) {
        res.status(400).json({ error: "Daftar pembicara tidak valid." });
        return;
      }

      const targetSpeaker =
        speakers.find((s: { id?: string }) => s.id === targetSpeakerId) ??
        speakers[0];
      const targetName =
        typeof targetSpeaker?.name === "string" && targetSpeaker.name.trim()
          ? targetSpeaker.name.trim()
          : "Pembicara";
      const targetStyle =
        typeof targetSpeaker?.style === "string" && targetSpeaker.style.trim()
          ? targetSpeaker.style.trim()
          : "Alami dan ramah";

      const formattedHistory = Array.isArray(historyLines)
        ? historyLines
            .filter((l: { text?: string }) => typeof l?.text === "string" && l.text.trim())
            .map(
              (l: { speaker?: string; text: string }) =>
                `${(l.speaker || "Pembicara").trim()}: ${l.text.trim()}`
            )
        : [];

      const participantSummary = speakers
        .map((s: { name?: string; style?: string }, i: number) =>
          `- ${(s.name || `Pembicara ${i + 1}`).trim()} (gaya: ${s.style || "alami"})`
        )
        .join("\n");

      const prompt =
        formattedHistory.length > 0
          ? `Peserta percakapan:\n${participantSummary}\n\nTranskrip percakapan sejauh ini:\n${formattedHistory.join("\n")}\n\nTuliskan satu tanggapan lanjutan yang alami dan kontekstual untuk diucapkan oleh ${targetName} (gaya intonasi: ${targetStyle}).`
          : `Peserta percakapan:\n${participantSummary}\n\nTuliskan satu kalimat pembuka percakapan yang alami dan menarik untuk diucapkan oleh ${targetName} (gaya intonasi: ${targetStyle}).`;

      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            "Kamu adalah penulis naskah dialog suara berbahasa Indonesia yang natural. Balas HANYA dengan teks ucapan langsung untuk pembicara yang diminta, tanpa awalan nama pembicara, tanpa tanda kutip, dan tanpa format markdown. Buat 1 hingga 2 kalimat yang ringkas, hidup, dan cocok untuk dibacakan dengan suara (boleh memakai jeda '...' seperlunya).",
        },
      });

      const replyText = (response.text ?? "")
        .trim()
        .replace(/^["“]|["”]$/g, "")
        .replace(new RegExp(`^${targetName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i"), "")
        .trim();

      if (!replyText) {
        res.status(502).json({
          error: "Asisten AI tidak menghasilkan tanggapan. Silakan coba lagi.",
        });
        return;
      }

      res.json({
        reply: replyText,
        speakerId: targetSpeaker.id,
      });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Vite integration in development, static dist serving in production
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*path}", (_req, res) => {
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build not found");
      }
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SuaraStudio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
