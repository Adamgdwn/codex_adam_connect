import { sanitizeTextForSpeech } from "../../utils/operatorConsole";

type TtsModule = {
  speak(text: string): void;
  stop(): void;
};

function getTtsModule(): TtsModule | null {
  try {
    return require("react-native-tts").default as TtsModule;
  } catch {
    return null;
  }
}

export class TtsService {
  private readonly tts = getTtsModule();

  isAvailable(): boolean {
    return this.tts !== null;
  }

  speak(text: string): void {
    const spokenText = sanitizeTextForSpeech(text);
    if (!spokenText) {
      return;
    }
    this.tts?.stop();
    this.tts?.speak(spokenText);
  }

  stop(): void {
    this.tts?.stop();
  }
}
