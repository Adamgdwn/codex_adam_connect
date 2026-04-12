import { Platform } from "react-native";
import { PERMISSIONS, RESULTS, checkMultiple, requestMultiple } from "react-native-permissions";

type VoiceModule = {
  onSpeechError?: ((event: { error?: { message?: string } }) => void) | null;
  onSpeechResults?: ((event: { value?: string[] }) => void) | null;
  start(locale: string): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
};

function getVoiceModule(): VoiceModule | null {
  try {
    const candidate = require("@react-native-voice/voice").default as VoiceModule | undefined;
    return candidate ?? null;
  } catch {
    return null;
  }
}

export class VoiceService {
  private readonly voice = getVoiceModule();

  async isAvailable(): Promise<boolean> {
    return this.voice !== null;
  }

  async startListening(onResult: (text: string) => void): Promise<void> {
    if (!this.voice) {
      throw new Error("Speech recognition is not available in this build.");
    }

    const permissions =
      Platform.OS === "ios"
        ? [PERMISSIONS.IOS.MICROPHONE, PERMISSIONS.IOS.SPEECH_RECOGNITION]
        : [PERMISSIONS.ANDROID.RECORD_AUDIO];

    const current = await checkMultiple(permissions);
    const missing = permissions.filter((permission) => current[permission] !== RESULTS.GRANTED);
    if (missing.length) {
      const granted = await requestMultiple(missing);
      const rejected = missing.find((permission) => granted[permission] !== RESULTS.GRANTED);
      if (rejected) {
        throw new Error("Microphone permission is required for voice input.");
      }
    }

    this.voice.onSpeechError = (event) => {
      throw new Error(event.error?.message ?? "Voice recognition failed.");
    };
    this.voice.onSpeechResults = (event) => {
      const first = event.value?.[0]?.trim();
      if (first) {
        onResult(first);
      }
    };

    await this.voice.start("en-US");
  }

  async stopListening(): Promise<void> {
    if (!this.voice) {
      return;
    }
    await this.voice.stop();
    await this.voice.destroy();
    this.voice.onSpeechError = null;
    this.voice.onSpeechResults = null;
  }
}
