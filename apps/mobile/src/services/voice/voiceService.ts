import {
  ExpoSpeechRecognitionModule,
  type ExpoSpeechRecognitionErrorEvent,
  type ExpoSpeechRecognitionResultEvent
} from "expo-speech-recognition";
import { Platform } from "react-native";

const NO_SPEECH_MESSAGE = "No speech was captured. Try again and speak after tapping the mic.";
const PREFERRED_ANDROID_SERVICE_PACKAGES = [
  "com.google.android.tts",
  "com.google.android.as",
  "com.google.android.googlequicksearchbox"
];

type VoiceCallbacks = {
  onListening?(): void;
  onSpeechStart?(): void;
  onSpeechEnd?(): void;
  onPartialTranscript?(text: string): void;
  onFinalTranscript?(text: string): void;
  onVolume?(value: number): void;
  onReconnect?(): void;
  onError(message: string): void;
};

function isContinuousRecognitionSupported(): boolean {
  return Platform.OS !== "android" || (typeof Platform.Version === "number" && Platform.Version >= 33);
}

function chooseAndroidRecognitionServicePackage(): string | undefined {
  if (Platform.OS !== "android") {
    return undefined;
  }

  try {
    const availableServices = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    const availableSet = new Set(availableServices);
    const defaultService = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName?.trim();

    if (defaultService && availableSet.has(defaultService)) {
      return defaultService;
    }

    return PREFERRED_ANDROID_SERVICE_PACKAGES.find((service) => availableSet.has(service)) ?? defaultService ?? undefined;
  } catch {
    return undefined;
  }
}

function formatVoiceError(event: ExpoSpeechRecognitionErrorEvent): string {
  switch (event.error) {
    case "not-allowed":
      return "Microphone permission is required for voice input.";
    case "service-not-allowed":
      return "Voice recognition is unavailable right now. Check the phone's default speech service and try again.";
    case "language-not-supported":
      return "The phone's speech service does not support English (United States) yet.";
    case "no-speech":
    case "speech-timeout":
      return NO_SPEECH_MESSAGE;
    default:
      return event.message?.trim() || "Voice recognition failed.";
  }
}

function isRecoverableSessionError(event: ExpoSpeechRecognitionErrorEvent): boolean {
  return event.error === "aborted" || event.error === "busy" || event.error === "no-speech" || event.error === "speech-timeout";
}

export class VoiceService {
  private subscriptions: Array<{ remove(): void }> = [];
  private latestTranscript = "";
  private sessionActive = false;
  private manualStopRequested = false;
  private callbacks: VoiceCallbacks | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private forceAbortTimer: ReturnType<typeof setTimeout> | null = null;

  async isAvailable(): Promise<boolean> {
    try {
      if (ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        return true;
      }

      if (Platform.OS === "android") {
        return ExpoSpeechRecognitionModule.getSpeechRecognitionServices().length > 0;
      }

      return false;
    } catch {
      return false;
    }
  }

  async startStreamingSession(callbacks: VoiceCallbacks): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error("Speech recognition is not available in this build.");
    }

    const permissions = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissions.granted) {
      throw new Error("Microphone permission is required for voice input.");
    }

    this.stopStreamingSession();
    this.clearForceAbortTimer();
    this.callbacks = callbacks;
    this.sessionActive = true;
    this.manualStopRequested = false;
    this.latestTranscript = "";
    this.attachListeners();
    this.startRecognition();
  }

  stopStreamingSession(): void {
    this.manualStopRequested = true;
    this.sessionActive = false;
    this.clearReconnectTimer();
    this.clearForceAbortTimer();

    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore cleanup failures between sessions.
    }

    this.forceAbortTimer = setTimeout(() => {
      this.forceAbortTimer = null;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Ignore forced cleanup failures between sessions.
      }
    }, 150);

    this.cleanup();
  }

  async startListening(onResult: (text: string) => void, onError: (message: string) => void): Promise<void> {
    await this.startStreamingSession({
      onFinalTranscript: (text) => {
        onResult(text);
        this.stopStreamingSession();
      },
      onError
    });
  }

  async stopListening(): Promise<void> {
    this.stopStreamingSession();
  }

  private attachListeners(): void {
    this.subscriptions = [
      ExpoSpeechRecognitionModule.addListener("start", () => {
        this.callbacks?.onListening?.();
      }),
      ExpoSpeechRecognitionModule.addListener("speechstart", () => {
        this.callbacks?.onSpeechStart?.();
      }),
      ExpoSpeechRecognitionModule.addListener("speechend", () => {
        this.callbacks?.onSpeechEnd?.();
      }),
      ExpoSpeechRecognitionModule.addListener("volumechange", (event: { value: number }) => {
        this.callbacks?.onVolume?.(event.value);
      }),
      ExpoSpeechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        const transcript = event.results[0]?.transcript?.trim();
        if (!transcript) {
          return;
        }

        this.latestTranscript = transcript;
        if (event.isFinal) {
          this.callbacks?.onFinalTranscript?.(transcript);
          this.latestTranscript = "";
          return;
        }

        this.callbacks?.onPartialTranscript?.(transcript);
      }),
      ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        if (this.latestTranscript && (event.error === "no-speech" || event.error === "speech-timeout")) {
          this.callbacks?.onFinalTranscript?.(this.latestTranscript);
          this.latestTranscript = "";
          return;
        }

        if (this.sessionActive && !this.manualStopRequested && isRecoverableSessionError(event)) {
          this.callbacks?.onReconnect?.();
          this.restartRecognition(300);
          return;
        }

        this.callbacks?.onError(formatVoiceError(event));
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        if (this.sessionActive && !this.manualStopRequested) {
          this.callbacks?.onReconnect?.();
          this.restartRecognition(200);
        }
      })
    ];
  }

  private startRecognition(): void {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        maxAlternatives: 1,
        continuous: isContinuousRecognitionSupported(),
        addsPunctuation: false,
        androidRecognitionServicePackage: chooseAndroidRecognitionServicePackage(),
        androidIntentOptions: {
          EXTRA_LANGUAGE_MODEL: "free_form",
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 12000,
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 2500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1200
        }
      });
    } catch (error) {
      this.callbacks?.onError(error instanceof Error ? error.message : "Voice recognition could not start.");
      this.stopStreamingSession();
    }
  }

  private restartRecognition(delayMs: number): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.sessionActive || this.manualStopRequested) {
        return;
      }

      this.startRecognition();
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (!this.reconnectTimer) {
      return;
    }

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private clearForceAbortTimer(): void {
    if (!this.forceAbortTimer) {
      return;
    }

    clearTimeout(this.forceAbortTimer);
    this.forceAbortTimer = null;
  }

  private cleanup(): void {
    this.clearReconnectTimer();
    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    this.latestTranscript = "";
    this.callbacks = null;
  }
}
