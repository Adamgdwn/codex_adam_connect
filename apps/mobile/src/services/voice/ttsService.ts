import { Platform } from "react-native";
import { sanitizeTextForSpeech } from "../../utils/operatorConsole";

type ReactNativeTtsModule = {
  voices?(): Promise<
    Array<{
      id: string;
      name: string;
      language: string;
      quality: number;
      latency: number;
      networkConnectionRequired: boolean;
      notInstalled: boolean;
    }>
  >;
  engines?(): Promise<
    Array<{
      name: string;
      label: string;
      default: boolean;
      icon: number;
    }>
  >;
  getInitStatus?(): Promise<"success" | true>;
  requestInstallEngine?(): Promise<"success" | true>;
  setDefaultEngine?(engineName: string): Promise<boolean>;
  setDefaultVoice?(voiceId: string): Promise<"success" | boolean>;
  setDefaultLanguage?(language: string): Promise<"success" | boolean>;
  setDefaultRate?(rate: number, skipTransform?: boolean): Promise<"success">;
  setDucking?(enabled: boolean): Promise<"success" | boolean>;
  speak(
    text: string,
    options?: {
      androidParams?: {
        KEY_PARAM_STREAM?: "STREAM_MUSIC";
        KEY_PARAM_VOLUME?: number;
        KEY_PARAM_PAN?: number;
      };
    }
  ): string | number;
  stop(): Promise<boolean> | void;
  addEventListener?(
    type: "tts-start" | "tts-finish" | "tts-cancel" | "tts-error",
    handler: (event: { utteranceId?: string | number; code?: string; message?: string }) => void
  ): void;
  removeEventListener?(
    type: "tts-start" | "tts-finish" | "tts-cancel" | "tts-error",
    handler: (event: { utteranceId?: string | number; code?: string; message?: string }) => void
  ): void;
};

type ExpoSpeechModule = {
  speak(
    text: string,
    options?: {
      language?: string;
      voice?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
      onStart?(): void;
      onDone?(): void;
      onStopped?(): void;
      onError?(error: { error?: string; message?: string }): void;
    }
  ): void;
  stop(): void;
  isSpeakingAsync?(): Promise<boolean>;
  getAvailableVoicesAsync?(): Promise<
    Array<{
      identifier?: string;
      name?: string;
      language?: string;
      quality?: string;
    }>
  >;
};

type SpeechHandlers = {
  onStart?(): void;
  onFinish?(): void;
  onCancel?(): void;
  onError?(message: string): void;
};

function getReactNativeTtsModule(): ReactNativeTtsModule | null {
  try {
    return require("react-native-tts").default as ReactNativeTtsModule;
  } catch {
    return null;
  }
}

function getExpoSpeechModule(): ExpoSpeechModule | null {
  try {
    return require("expo-speech") as ExpoSpeechModule;
  } catch {
    return null;
  }
}

export class TtsService {
  private readonly reactNativeTts = getReactNativeTtsModule();
  private readonly expoSpeech = getExpoSpeechModule();
  private handlersConfigured = false;
  private initPromise: Promise<boolean> | null = null;
  private errorHandler: ((message: string) => void) | null = null;
  private handlers: SpeechHandlers = {};
  private expoVoice: { language: string; identifier?: string } | null = null;

  isAvailable(): boolean {
    return this.resolveBackend() !== null;
  }

  async prepare(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    return this.initPromise;
  }

  configureHandlers(handlers: {
    onStart?(): void;
    onFinish?(): void;
    onCancel?(): void;
    onError?(message: string): void;
  }): void {
    this.handlers = handlers;
    this.errorHandler = handlers.onError ?? null;

    if (this.handlersConfigured || !this.reactNativeTts?.addEventListener) {
      return;
    }

    this.reactNativeTts.addEventListener("tts-start", () => this.handlers.onStart?.());
    this.reactNativeTts.addEventListener("tts-finish", () => this.handlers.onFinish?.());
    this.reactNativeTts.addEventListener("tts-cancel", () => this.handlers.onCancel?.());
    this.reactNativeTts.addEventListener("tts-error", (event) =>
      this.handlers.onError?.(event.message?.trim() || "Text-to-speech failed.")
    );
    this.handlersConfigured = true;
  }

  speak(text: string): string | number | null {
    const spokenText = sanitizeTextForSpeech(text);
    if (!spokenText) {
      return null;
    }

    this.prepare()
      .then((ready) => {
        if (!ready) {
          this.errorHandler?.("Spoken replies are unavailable because phone speech output is not ready on this device.");
          return;
        }

        this.speakWithFallback(spokenText);
      })
      .catch((error) => {
        this.errorHandler?.(error instanceof Error ? error.message : "Text-to-speech failed.");
      });
    return spokenText;
  }

  stop(): void {
    this.reactNativeTts?.stop();
    this.expoSpeech?.stop();
  }

  async describeAvailability(): Promise<string> {
    const backend = this.resolveBackend();
    if (!backend) {
      return "Spoken replies are unavailable because this build does not include a phone speech-output backend.";
    }

    const ready = await this.prepare();
    if (backend === "expo-speech") {
      const voices = (await this.expoSpeech?.getAvailableVoicesAsync?.().catch(() => [])) ?? [];
      const englishVoices = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.language ?? ""));
      return ready
        ? `Phone speech output is ready using Expo speech. English voices available: ${englishVoices.length}.`
        : `Phone speech output is not ready using Expo speech. English voices available: ${englishVoices.length}.`;
    }

    const engines = (await this.reactNativeTts?.engines?.().catch(() => [])) ?? [];
    const voices = (await this.reactNativeTts?.voices?.().catch(() => [])) ?? [];
    const installedEnglishVoices = voices.filter((voice) => !voice.notInstalled && /^en(?:[-_]|$)/i.test(voice.language));
    const defaultEngine = engines.find((engine) => engine.default)?.label ?? engines[0]?.label ?? "none detected";

    return ready
      ? `Phone speech output is ready using Android text-to-speech. Default engine: ${defaultEngine}. English voices available: ${installedEnglishVoices.length}.`
      : `Phone speech output is not ready using Android text-to-speech. Default engine: ${defaultEngine}. English voices available: ${installedEnglishVoices.length}.`;
  }

  private async initialize(): Promise<boolean> {
    const backend = this.resolveBackend();
    if (!backend) {
      return false;
    }

    if (backend === "expo-speech") {
      return this.initializeExpoSpeech();
    }

    return this.initializeReactNativeTts();
  }

  private resolveBackend(): "expo-speech" | "react-native-tts" | null {
    if (Platform.OS === "android" && this.expoSpeech) {
      return "expo-speech";
    }

    if (this.reactNativeTts) {
      return "react-native-tts";
    }

    if (this.expoSpeech) {
      return "expo-speech";
    }

    return null;
  }

  private async initializeExpoSpeech(): Promise<boolean> {
    if (!this.expoSpeech) {
      return false;
    }

    try {
      const voices = (await this.expoSpeech.getAvailableVoicesAsync?.().catch(() => [])) ?? [];
      const preferredVoice =
        voices.find((voice) => /^en(?:-|_)US$/i.test(voice.language ?? "")) ??
        voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.language ?? "")) ??
        null;

      this.expoVoice = {
        language: preferredVoice?.language ?? "en-US",
        ...(Platform.OS !== "android" && preferredVoice?.identifier ? { identifier: preferredVoice.identifier } : {})
      };
      return true;
    } catch {
      this.expoVoice = {
        language: "en-US"
      };
      return true;
    }
  }

  private async initializeReactNativeTts(): Promise<boolean> {
    if (!this.reactNativeTts) {
      return false;
    }

    try {
      await this.reactNativeTts.getInitStatus?.();
      const engines = (await this.reactNativeTts.engines?.().catch(() => [])) ?? [];
      const defaultEngine = engines.find((engine) => engine.default) ?? engines[0];
      if (defaultEngine?.name) {
        await this.reactNativeTts.setDefaultEngine?.(defaultEngine.name).catch(() => true);
      }

      const voices = (await this.reactNativeTts.voices?.().catch(() => [])) ?? [];
      const preferredVoice =
        voices.find((voice) => !voice.notInstalled && !voice.networkConnectionRequired && /^en(?:-|_)US$/i.test(voice.language)) ??
        voices.find((voice) => !voice.notInstalled && !voice.networkConnectionRequired && /^en(?:[-_]|$)/i.test(voice.language)) ??
        voices.find((voice) => !voice.notInstalled && /^en(?:[-_]|$)/i.test(voice.language)) ??
        null;

      if (preferredVoice?.id) {
        await this.reactNativeTts.setDefaultVoice?.(preferredVoice.id).catch(() => true);
        await this.reactNativeTts.setDefaultLanguage?.(preferredVoice.language).catch(() => true);
      } else {
        await this.reactNativeTts.setDefaultLanguage?.("en-US").catch(() => true);
      }

      await this.reactNativeTts.setDefaultRate?.(0.5, true).catch(() => "success");
      await this.reactNativeTts.setDucking?.(true).catch(() => true);
      return true;
    } catch (error) {
      const code = typeof error === "object" && error !== null && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
      if (code === "no_engine") {
        await this.reactNativeTts.requestInstallEngine?.().catch(() => true);
      }
      return false;
    }
  }

  private speakWithFallback(text: string): void {
    const backend = this.resolveBackend();
    if (backend === "expo-speech") {
      try {
        this.speakWithExpoSpeech(text);
        return;
      } catch (error) {
        if (!this.reactNativeTts) {
          throw error;
        }
      }
    }

    if (backend === "react-native-tts") {
      try {
        this.speakWithReactNativeTts(text);
        return;
      } catch (error) {
        if (!this.expoSpeech) {
          throw error;
        }
      }
    }

    if (this.expoSpeech) {
      this.speakWithExpoSpeech(text);
      return;
    }

    if (this.reactNativeTts) {
      this.speakWithReactNativeTts(text);
      return;
    }

    throw new Error("No speech backend is available on this phone.");
  }

  private speakWithExpoSpeech(text: string): void {
    if (!this.expoSpeech) {
      throw new Error("Expo speech is unavailable.");
    }

    this.expoSpeech.speak(text, {
      language: this.expoVoice?.language ?? "en-US",
      ...(this.expoVoice?.identifier ? { voice: this.expoVoice.identifier } : {}),
      rate: 0.92,
      pitch: 1.0,
      volume: 1.0,
      onStart: () => this.handlers.onStart?.(),
      onDone: () => this.handlers.onFinish?.(),
      onStopped: () => this.handlers.onCancel?.(),
      onError: (error) => this.handlers.onError?.(error.message?.trim() || error.error?.trim() || "Speech playback failed.")
    });
  }

  private speakWithReactNativeTts(text: string): void {
    if (!this.reactNativeTts) {
      throw new Error("Android text-to-speech is unavailable.");
    }

    this.reactNativeTts.speak(text, {
      androidParams: {
        KEY_PARAM_STREAM: "STREAM_MUSIC",
        KEY_PARAM_VOLUME: 1.0,
        KEY_PARAM_PAN: 0
      }
    });
  }
}
