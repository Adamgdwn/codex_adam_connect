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
    this.tts?.stop();
    this.tts?.speak(text);
  }

  stop(): void {
    this.tts?.stop();
  }
}
