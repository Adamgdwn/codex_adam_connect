import { Platform } from "react-native";
import { sanitizeTextForSpeech } from "../../utils/operatorConsole";

export interface TtsVoiceOption {
  id: string;
  label: string;
  language: string;
  qualityLabel: string | null;
  backend: "expo-speech" | "react-native-tts";
  nativeIdentifier?: string | null;
}

type SpeechBackend = "expo-speech" | "react-native-tts";

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
  private preferredVoiceId: string | null = null;
  private selectedVoiceId: string | null = null;
  private lastSuccessfulBackend: SpeechBackend | null = null;
  private lastAttemptedBackend: SpeechBackend | null = null;

  isAvailable(): boolean {
    return this.resolvePreferredBackend() !== null;
  }

  async prepare(preferredVoiceId?: string | null): Promise<boolean> {
    if (!this.isAvailable()) {
      return false;
    }

    if (preferredVoiceId !== undefined) {
      this.preferredVoiceId = preferredVoiceId;
    }

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    return this.initPromise;
  }

  async listVoices(): Promise<TtsVoiceOption[]> {
    const backend = this.resolvePreferredBackend();
    if (!backend) {
      return [];
    }

    const ready = await this.prepare();
    if (!ready) {
      return [];
    }

    return backend === "expo-speech" ? this.getExpoVoiceOptions() : this.getReactNativeVoiceOptions();
  }

  async setPreferredVoice(voiceId: string | null): Promise<TtsVoiceOption | null> {
    this.preferredVoiceId = voiceId;
    const ready = await this.prepare();
    if (!ready) {
      return null;
    }

    return this.applyPreferredVoice();
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

    this.reactNativeTts.addEventListener("tts-start", () => this.handleSpeechStart());
    this.reactNativeTts.addEventListener("tts-finish", () => this.handlers.onFinish?.());
    this.reactNativeTts.addEventListener("tts-cancel", () => this.handlers.onCancel?.());
    this.reactNativeTts.addEventListener("tts-error", (event) => this.handlers.onError?.(event.message?.trim() || "Text-to-speech failed."));
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

  retryWithAlternateBackend(text: string): boolean {
    const spokenText = sanitizeTextForSpeech(text);
    if (!spokenText) {
      return false;
    }

    const alternateBackend = this.resolveAlternateBackend(this.lastAttemptedBackend);
    if (!alternateBackend) {
      return false;
    }

    try {
      this.speakWithBackend(alternateBackend, spokenText);
      return true;
    } catch {
      return false;
    }
  }

  async describeAvailability(): Promise<string> {
    const backend = this.resolvePreferredBackend();
    if (!backend) {
      return "Spoken replies are unavailable because this build does not include a phone speech-output backend.";
    }

    const ready = await this.prepare();
    if (backend === "expo-speech") {
      const voices = await this.getExpoVoiceOptions();
      const englishVoices = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.language));
      const currentVoice = voices.find((voice) => voice.id === this.selectedVoiceId);
      return ready
        ? `Phone speech output is ready using Expo speech. Current voice: ${currentVoice?.label ?? "default English"}. English voices available: ${englishVoices.length}.`
        : `Phone speech output is not ready using Expo speech. Current voice: ${currentVoice?.label ?? "default English"}. English voices available: ${englishVoices.length}.`;
    }

    const engines = (await this.reactNativeTts?.engines?.().catch(() => [])) ?? [];
    const voices = await this.getReactNativeVoiceOptions();
    const installedEnglishVoices = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.language));
    const defaultEngine = engines.find((engine) => engine.default)?.label ?? engines[0]?.label ?? "none detected";
    const currentVoice = voices.find((voice) => voice.id === this.selectedVoiceId);

    return ready
      ? `Phone speech output is ready using Android text-to-speech. Default engine: ${defaultEngine}. Current voice: ${currentVoice?.label ?? "default English"}. English voices available: ${installedEnglishVoices.length}.`
      : `Phone speech output is not ready using Android text-to-speech. Default engine: ${defaultEngine}. Current voice: ${currentVoice?.label ?? "default English"}. English voices available: ${installedEnglishVoices.length}.`;
  }

  private async initialize(): Promise<boolean> {
    const backend = this.resolvePreferredBackend();
    if (!backend) {
      return false;
    }

    if (backend === "expo-speech") {
      return this.initializeExpoSpeech();
    }

    return this.initializeReactNativeTts();
  }

  private resolvePreferredBackend(): SpeechBackend | null {
    const availableBackends = this.availableBackends();
    if (!availableBackends.length) {
      return null;
    }

    if (this.lastSuccessfulBackend && availableBackends.includes(this.lastSuccessfulBackend)) {
      return this.lastSuccessfulBackend;
    }

    return this.defaultBackendOrder().find((backend) => availableBackends.includes(backend)) ?? availableBackends[0];
  }

  private resolveAlternateBackend(currentBackend: SpeechBackend | null): SpeechBackend | null {
    const availableBackends = this.availableBackends();
    if (!availableBackends.length) {
      return null;
    }

    const alternateBackend = availableBackends.find((backend) => backend !== currentBackend);
    return alternateBackend ?? null;
  }

  private availableBackends(): SpeechBackend[] {
    const available: SpeechBackend[] = [];
    if (this.expoSpeech) {
      available.push("expo-speech");
    }
    if (this.reactNativeTts) {
      available.push("react-native-tts");
    }
    return available;
  }

  private defaultBackendOrder(): SpeechBackend[] {
    return Platform.OS === "android" ? ["expo-speech", "react-native-tts"] : ["react-native-tts", "expo-speech"];
  }

  private async initializeExpoSpeech(): Promise<boolean> {
    if (!this.expoSpeech) {
      return false;
    }

    try {
      await this.applyExpoVoicePreference();
      return true;
    } catch {
      this.expoVoice = {
        language: "en-US"
      };
      this.selectedVoiceId = null;
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

      await this.reactNativeTts.setDefaultRate?.(0.5, true).catch(() => "success");
      await this.reactNativeTts.setDucking?.(true).catch(() => true);
      await this.applyReactNativeVoicePreference();
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
    const primaryBackend = this.resolvePreferredBackend();
    if (!primaryBackend) {
      throw new Error("No speech backend is available on this phone.");
    }

    try {
      this.speakWithBackend(primaryBackend, text);
      return;
    } catch (error) {
      const alternateBackend = this.resolveAlternateBackend(primaryBackend);
      if (!alternateBackend) {
        throw error;
      }

      this.speakWithBackend(alternateBackend, text);
    }
  }

  private speakWithBackend(backend: SpeechBackend, text: string): void {
    this.lastAttemptedBackend = backend;
    if (backend === "expo-speech") {
      this.speakWithExpoSpeech(text);
      return;
    }

    this.speakWithReactNativeTts(text);
  }

  private handleSpeechStart(): void {
    if (this.lastAttemptedBackend) {
      this.lastSuccessfulBackend = this.lastAttemptedBackend;
    }
    this.handlers.onStart?.();
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
      onStart: () => this.handleSpeechStart(),
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

  private async applyPreferredVoice(): Promise<TtsVoiceOption | null> {
    const backend = this.resolvePreferredBackend();
    if (!backend) {
      this.selectedVoiceId = null;
      return null;
    }

    return backend === "expo-speech" ? this.applyExpoVoicePreference() : this.applyReactNativeVoicePreference();
  }

  private async applyExpoVoicePreference(): Promise<TtsVoiceOption | null> {
    const voices = await this.getExpoVoiceOptions();
    const preferredVoice =
      (this.preferredVoiceId ? voices.find((voice) => voice.id === this.preferredVoiceId) : null) ??
      voices.find((voice) => /^en(?:-|_)US$/i.test(voice.language)) ??
      voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.language)) ??
      voices[0] ??
      null;

    this.selectedVoiceId = preferredVoice?.id ?? null;
    this.expoVoice = {
      language: preferredVoice?.language ?? "en-US",
      ...(preferredVoice?.nativeIdentifier ? { identifier: preferredVoice.nativeIdentifier } : {})
    };

    return preferredVoice;
  }

  private async applyReactNativeVoicePreference(): Promise<TtsVoiceOption | null> {
    const voices = await this.getReactNativeVoiceOptions();
    const preferredVoice =
      (this.preferredVoiceId ? voices.find((voice) => voice.id === this.preferredVoiceId) : null) ??
      voices.find((voice) => /^en(?:-|_)US$/i.test(voice.language) && voice.qualityLabel !== "Network") ??
      voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.language) && voice.qualityLabel !== "Network") ??
      voices.find((voice) => /^en(?:[-_]|$)/i.test(voice.language)) ??
      voices[0] ??
      null;

    this.selectedVoiceId = preferredVoice?.id ?? null;

    if (preferredVoice?.id) {
      await this.reactNativeTts?.setDefaultVoice?.(preferredVoice.id).catch(() => true);
      await this.reactNativeTts?.setDefaultLanguage?.(preferredVoice.language).catch(() => true);
    } else {
      await this.reactNativeTts?.setDefaultLanguage?.("en-US").catch(() => true);
    }

    return preferredVoice;
  }

  private async getExpoVoiceOptions(): Promise<TtsVoiceOption[]> {
    const voices = (await this.expoSpeech?.getAvailableVoicesAsync?.().catch(() => [])) ?? [];
    return voices
      .map((voice, index) => ({
        id: voice.identifier ?? `${voice.language ?? "unknown"}:${voice.name ?? index}`,
        label: voice.name?.trim() || voice.identifier?.trim() || `Voice ${index + 1}`,
        language: voice.language ?? "unknown",
        qualityLabel: voice.quality?.trim() || null,
        backend: "expo-speech" as const,
        nativeIdentifier: voice.identifier ?? null
      }))
      .sort(compareVoiceOptions);
  }

  private async getReactNativeVoiceOptions(): Promise<TtsVoiceOption[]> {
    const voices = (await this.reactNativeTts?.voices?.().catch(() => [])) ?? [];
    return voices
      .filter((voice) => !voice.notInstalled)
      .map((voice) => ({
        id: voice.id,
        label: voice.name?.trim() || voice.id,
        language: voice.language,
        qualityLabel: voice.networkConnectionRequired ? "Network" : voice.quality >= 500 ? "Enhanced" : "Standard",
        backend: "react-native-tts" as const,
        nativeIdentifier: voice.id
      }))
      .sort(compareVoiceOptions);
  }
}

function compareVoiceOptions(left: TtsVoiceOption, right: TtsVoiceOption): number {
  const leftEnglish = /^en(?:[-_]|$)/i.test(left.language);
  const rightEnglish = /^en(?:[-_]|$)/i.test(right.language);
  if (leftEnglish !== rightEnglish) {
    return leftEnglish ? -1 : 1;
  }

  if (left.language !== right.language) {
    return left.language.localeCompare(right.language);
  }

  return left.label.localeCompare(right.label);
}
