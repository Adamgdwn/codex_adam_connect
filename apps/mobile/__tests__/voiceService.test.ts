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

  test("finalizes the latest transcript and restarts recognition after an unexpected end", async () => {
    const service = new VoiceService();
    const onFinalTranscript = jest.fn();
    const onReconnect = jest.fn();

    await service.startStreamingSession({
      onFinalTranscript,
      onReconnect,
      onError: jest.fn()
    });

    const resultListener = getListener("result");
    const endListener = getListener("end");

    resultListener({
      results: [{ transcript: "resume after the pause" }],
      isFinal: false
    });
    endListener();

    expect(onFinalTranscript).toHaveBeenCalledWith("resume after the pause");
    expect(onReconnect).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(260);
    jest.advanceTimersByTime(140);

    expect(ExpoSpeechRecognitionModule.stop).toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledTimes(2);
  });
});

function getListener(eventName: string): (payload?: unknown) => void {
  const call = (ExpoSpeechRecognitionModule.addListener as jest.Mock).mock.calls.find(([name]) => name === eventName);
  if (!call) {
    throw new Error(`Expected a listener for ${eventName}`);
  }

  return call[1] as (payload?: unknown) => void;
}
