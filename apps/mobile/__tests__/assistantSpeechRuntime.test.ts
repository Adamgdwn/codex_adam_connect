import { AssistantSpeechRuntime } from "../src/services/voice/assistantSpeechRuntime";
import type { TtsService } from "../src/services/voice/ttsService";

describe("AssistantSpeechRuntime", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("reports a visible error when speech never starts", () => {
    const { runtime, speak } = createRuntime();
    const onBeforeSpeak = jest.fn();
    const onSpeakingChange = jest.fn();
    const onSpeechError = jest.fn();

    runtime.configure({
      onBeforeSpeak,
      onSpeakingChange,
      onSpeechError
    });

    expect(runtime.ingest("assistant-1", "This should be spoken aloud.", "completed", 8)).toBe(true);
    expect(onBeforeSpeak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2500);

    expect(onSpeakingChange).toHaveBeenCalledWith(false);
    expect(onSpeechError).toHaveBeenCalledWith(
      "Spoken replies could not start on this phone. Check Android text-to-speech output and media volume."
    );
  });

  test("keeps chunked playback inside one assistant-speaking span", () => {
    const { runtime, speak, trigger } = createRuntime();
    const onSpeakingChange = jest.fn();

    runtime.configure({
      onSpeakingChange
    });

    expect(runtime.ingest("assistant-2", "First sentence. Second sentence follows.", "completed", 8)).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);

    trigger("onStart");
    trigger("onFinish");

    expect(speak).toHaveBeenCalledTimes(2);
    expect(onSpeakingChange).toHaveBeenCalledTimes(1);
    expect(onSpeakingChange).toHaveBeenNthCalledWith(1, true);

    trigger("onStart");
    trigger("onFinish");

    expect(onSpeakingChange).toHaveBeenCalledTimes(2);
    expect(onSpeakingChange).toHaveBeenNthCalledWith(2, false);
  });

  test("queues a follow-up spoken prompt after the current reply", () => {
    const { runtime, speak, trigger } = createRuntime();

    runtime.configure({
      onSpeakingChange: jest.fn()
    });

    expect(runtime.ingest("assistant-3", "Here is the summary.", "completed", 8)).toBe(true);
    expect(runtime.queuePrompt("Say yes, send it to confirm.")).toBe(true);
    expect(speak).toHaveBeenCalledTimes(1);

    trigger("onStart");
    trigger("onFinish");

    expect(speak).toHaveBeenCalledTimes(2);
    expect(speak).toHaveBeenNthCalledWith(2, "Say yes, send it to confirm.");
  });
});

function createRuntime(): {
  runtime: AssistantSpeechRuntime;
  speak: jest.Mock<string | null, [string]>;
  trigger(name: "onStart" | "onFinish" | "onCancel" | "onError", message?: string): void;
} {
  let handlers: {
    onStart?(): void;
    onFinish?(): void;
    onCancel?(): void;
    onError?(message: string): void;
  } = {};

  const speak = jest.fn<string | null, [string]>(() => "spoken");
  const fakeTts = {
    isAvailable: () => true,
    configureHandlers(nextHandlers: typeof handlers) {
      handlers = nextHandlers;
    },
    speak,
    stop: jest.fn()
  } as unknown as TtsService;

  return {
    runtime: new AssistantSpeechRuntime(fakeTts),
    speak,
    trigger(name, message) {
      if (name === "onError") {
        handlers.onError?.(message ?? "failed");
        return;
      }

      handlers[name]?.();
    }
  };
}
