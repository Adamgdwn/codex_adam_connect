import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const defaultBaseUrl =
  process.env.MOBILE_DEFAULT_BASE_URL?.trim() || process.env.ADAM_CONNECT_DEFAULT_BASE_URL?.trim() || "";
const voiceSessionEnabled = process.env.MOBILE_VOICE_SESSION_ENABLED?.trim() !== "false";
const voiceInterruptMinChars = Number.parseInt(process.env.MOBILE_VOICE_INTERRUPT_MIN_CHARS?.trim() ?? "8", 10);
const voiceBackchannelMaxWords = Number.parseInt(process.env.MOBILE_VOICE_BACKCHANNEL_MAX_WORDS?.trim() ?? "2", 10);
const voiceTtsMinChars = Number.parseInt(process.env.MOBILE_VOICE_TTS_MIN_CHARS?.trim() ?? "72", 10);
const googleServicesPath = path.join(repoRoot, "apps/mobile/android/app/google-services.json");
const fcmEnabled = await fs
  .access(googleServicesPath)
  .then(() => true)
  .catch(() => false);

const targetPath = path.join(repoRoot, "apps/mobile/src/generated/runtimeConfig.ts");
await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.writeFile(
  targetPath,
  `export const DEFAULT_BASE_URL = ${JSON.stringify(defaultBaseUrl)};\n` +
    `export const FCM_ENABLED = ${JSON.stringify(fcmEnabled)};\n` +
    `export const VOICE_SESSION_ENABLED = ${JSON.stringify(voiceSessionEnabled)};\n` +
    `export const VOICE_INTERRUPT_MIN_CHARS = ${Number.isFinite(voiceInterruptMinChars) ? voiceInterruptMinChars : 8};\n` +
    `export const VOICE_BACKCHANNEL_MAX_WORDS = ${Number.isFinite(voiceBackchannelMaxWords) ? voiceBackchannelMaxWords : 2};\n` +
    `export const VOICE_TTS_MIN_CHARS = ${Number.isFinite(voiceTtsMinChars) ? voiceTtsMinChars : 72};\n`,
  "utf8"
);
