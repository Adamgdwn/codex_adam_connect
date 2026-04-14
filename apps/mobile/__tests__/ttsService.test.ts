import { TtsService } from "../src/services/voice/ttsService";

const ReactNativeTts = require("react-native-tts").default;

describe("TtsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("lists installed voices in a stable, user-friendly order", async () => {
    const service = new TtsService();

    const voices = await service.listVoices();

    expect(voices.map((voice) => voice.id)).toEqual(["en-gb-enhanced", "en-us-standard"]);
    expect(voices[0]).toMatchObject({
      id: "en-gb-enhanced",
      label: "English UK Enhanced",
      language: "en-GB",
      qualityLabel: "Enhanced"
    });
  });

  test("applies the selected voice when the user chooses one", async () => {
    const service = new TtsService();

    await service.setPreferredVoice("en-gb-enhanced");

    expect(ReactNativeTts.setDefaultVoice).toHaveBeenCalledWith("en-gb-enhanced");
    expect(ReactNativeTts.setDefaultLanguage).toHaveBeenCalledWith("en-GB");
  });

  test("falls back to the automatic English voice when the selection is cleared", async () => {
    const service = new TtsService();

    await service.setPreferredVoice("en-gb-enhanced");
    jest.clearAllMocks();

    await service.setPreferredVoice(null);

    expect(ReactNativeTts.setDefaultVoice).toHaveBeenCalledWith("en-us-standard");
    expect(ReactNativeTts.setDefaultLanguage).toHaveBeenCalledWith("en-US");
  });
});
