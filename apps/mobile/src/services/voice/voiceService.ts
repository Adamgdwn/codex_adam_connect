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

export class VoiceService {
  private subscriptions: Array<{ remove(): void }> = [];
  private latestTranscript = "";
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private handled = false;
  private active = false;
  private onResult: ((text: string) => void) | null = null;
  private onError: ((message: string) => void) | null = null;

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

  async startListening(onResult: (text: string) => void, onError: (message: string) => void): Promise<void> {
    if (!(await this.isAvailable())) {
      throw new Error("Speech recognition is not available in this build.");
    }

    const permissions = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permissions.granted) {
      throw new Error("Microphone permission is required for voice input.");
    }

    this.abortActiveSession();
    this.onResult = onResult;
    this.onError = onError;
    this.latestTranscript = "";
    this.handled = false;
    this.active = true;
    this.subscriptions = [
      ExpoSpeechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
        const transcript = event.results[0]?.transcript?.trim();
        if (transcript) {
          this.latestTranscript = transcript;
        }

        if (event.isFinal && transcript) {
          this.resolveResult(transcript);
        }
      }),
      ExpoSpeechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
        if (this.latestTranscript && (event.error === "no-speech" || event.error === "speech-timeout")) {
          this.resolveResult(this.latestTranscript);
          return;
        }
        this.resolveError(formatVoiceError(event));
      }),
      ExpoSpeechRecognitionModule.addListener("end", () => {
        this.scheduleFinish(250);
      })
    ];

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
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 12000,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 6000
        }
      });
    } catch (error) {
      this.cleanup();
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.active) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.stop();
      this.scheduleFinish(1500);
    } catch {
      this.finishCurrentSession();
    }
  }

  private abortActiveSession(): void {
    if (!this.active && this.subscriptions.length === 0) {
      return;
    }

    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Ignore cleanup failures between sessions.
    }

    this.cleanup();
  }

  private scheduleFinish(delayMs: number): void {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
    }

    this.finishTimer = setTimeout(() => {
      this.finishCurrentSession();
    }, delayMs);
  }

  private finishCurrentSession(): void {
    if (this.handled) {
      return;
    }

    if (this.latestTranscript) {
      this.resolveResult(this.latestTranscript);
      return;
    }

    this.resolveError(NO_SPEECH_MESSAGE);
  }

  private resolveResult(text: string): void {
    if (this.handled) {
      return;
    }

    const callback = this.onResult;
    this.cleanup();
    this.handled = true;
    callback?.(text);
  }

  private resolveError(message: string): void {
    if (this.handled) {
      return;
    }

    const callback = this.onError;
    this.cleanup();
    this.handled = true;
    callback?.(message);
  }

  private cleanup(): void {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = null;
    }

    this.subscriptions.forEach((subscription) => subscription.remove());
    this.subscriptions = [];
    this.active = false;
    this.latestTranscript = "";
    this.onResult = null;
    this.onError = null;
    this.handled = false;
  }
}
