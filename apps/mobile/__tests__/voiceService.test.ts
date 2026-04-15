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

  test("restarts recognition after an unexpected end without resetting the recognizer", async () => {
    const service = new VoiceService();
    const onFinalTranscript = jest.fn();
    const onReconnect = jest.fn();

    await service.startStreamingSession({
      onFinalTranscript,
      onReconnect,
      onError: jest.fn()
    });
    (ExpoSpeechRecognitionModule.start as jest.Mock).mockClear();
    (ExpoSpeechRecognitionModule.stop as jest.Mock).mockClear();
    (ExpoSpeechRecognitionModule.abort as jest.Mock).mockClear();

    const resultListener = getListener("result");
    const endListener = getListener("end");

    resultListener({
      results: [{ transcript: "resume after the pause" }],
      isFinal: false
    });
    endListener();

    expect(onReconnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(200);

    expect(onFinalTranscript).not.toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.stop).not.toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.abort).not.toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(1);
  });
});

function getListener(eventName: string): (payload?: unknown) => void {
  const call = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(([name]) => name === eventName);
  if (!call) {
    throw new Error(`Expected a listener for ${eventName}`);
  }

  return call[1] as (payload?: unknown) => void;
}
