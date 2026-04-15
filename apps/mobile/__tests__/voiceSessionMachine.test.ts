import {
  createSpeechChunk,
  isBackchannelUtterance,
  isLikelyAssistantEcho,
  mergeVoiceTranscriptSegments,
  shouldInterruptAssistant
} from "../src/services/voice/voiceSessionMachine";

describe("voice session machine helpers", () => {
  test("treats short acknowledgements as backchannel", () => {
    expect(isBackchannelUtterance("yeah", 2)).toBe(true);
    expect(isBackchannelUtterance("uh huh", 2)).toBe(true);
    expect(isBackchannelUtterance("hold on a second", 2)).toBe(false);
  });

  test("requires enough substance before interrupting assistant speech", () => {
    expect(shouldInterruptAssistant("yeah", 8, 2)).toBe(false);
    expect(shouldInterruptAssistant("stop and check the logs", 8, 2)).toBe(true);
    expect(shouldInterruptAssistant("stop", 8, 2)).toBe(true);
    expect(shouldInterruptAssistant("hold on", 8, 2)).toBe(true);
    expect(shouldInterruptAssistant("freedom", 8, 2)).toBe(false);
    expect(shouldInterruptAssistant("freedom stop", 8, 2)).toBe(true);
    expect(shouldInterruptAssistant("check the logs", 8, 2)).toBe(false);
    expect(shouldInterruptAssistant("check the repo logs and confirm the error", 8, 2)).toBe(true);
  });

  test("filters likely assistant echo without blocking explicit interrupts", () => {
    expect(
      isLikelyAssistantEcho(
        "I am checking the logs and the websocket reconnect path",
        "I am checking the logs and the websocket reconnect path right now."
      )
    ).toBe(true);
    expect(isLikelyAssistantEcho("stop", "Stop asking follow-up questions.")).toBe(false);
    expect(isLikelyAssistantEcho("hold on a second", "Hold on while I finish loading the result.")).toBe(false);
  });

  test("releases sentence-sized chunks for streaming TTS", () => {
    const first = createSpeechChunk("First sentence. Second sentence keeps going", 0, 12, false);
    expect(first).toEqual({
      chunk: "First sentence.",
      nextCursor: 15
    });

    const second = createSpeechChunk("First sentence. Second sentence keeps going", first?.nextCursor ?? 0, 12, true);
    expect(second?.chunk).toBe("Second sentence keeps going");
  });

  test("merges resumed transcript fragments into one turn", () => {
    expect(mergeVoiceTranscriptSegments("I need you to check", "check the logs and confirm")).toBe(
      "I need you to check the logs and confirm"
    );
    expect(mergeVoiceTranscriptSegments("Open the repo", "Open the repo and inspect auth")).toBe(
      "Open the repo and inspect auth"
    );
  });
});
