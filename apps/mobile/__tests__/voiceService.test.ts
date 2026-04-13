import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { VoiceService } from "../src/services/voice/voiceService";

describe("VoiceService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("stops recognition before forcing an abort fallback", async () => {
    const service = new VoiceService();

    await service.startStreamingSession({
      onError: jest.fn()
    });
    jest.clearAllMocks();

    service.stopStreamingSession();

    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);
    expect(ExpoSpeechRecognitionModule.abort).not.toHaveBeenCalled();

    jest.advanceTimersByTime(150);

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
  });

  test("still forces a native recognizer stop even if JS state thinks the session is idle", () => {
    const service = new VoiceService();

    service.stopStreamingSession();

    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(150);

    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalledTimes(1);
  });
});
