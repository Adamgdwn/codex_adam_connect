import type { ChatSession } from "@adam-connect/shared";
import {
  formatMessageTimestamp,
  isPairingRepairErrorMessage,
  requiresVoiceReview,
  sanitizeTextForSpeech,
  sortSessionsForDisplay,
  splitMessageContent
} from "../src/utils/operatorConsole";

describe("operatorConsole helpers", () => {
  test("sortSessionsForDisplay pins Operator first", () => {
    const sessions = [
      makeSession({ id: "2", title: "Project", updatedAt: "2026-04-12T12:00:00.000Z" }),
      makeSession({ id: "1", title: "Operator", updatedAt: "2026-04-12T11:00:00.000Z" })
    ];

    expect(sortSessionsForDisplay(sessions).map((session) => session.title)).toEqual(["Operator", "Project"]);
  });

  test("requiresVoiceReview flags risky or long transcripts", () => {
    expect(requiresVoiceReview("delete that file for me")).toBe(true);
    expect(requiresVoiceReview("a".repeat(181))).toBe(true);
    expect(requiresVoiceReview("tell me the repo status")).toBe(false);
  });

  test("sanitizeTextForSpeech removes markdown formatting and code fences", () => {
    expect(sanitizeTextForSpeech("## Heading\n- **Bold** text with `inline` code.\n```ts\nconst x = 1;\n```")).toBe(
      "Heading Bold text with inline code. Code block omitted."
    );
  });

  test("splitMessageContent preserves code blocks separately", () => {
    expect(splitMessageContent("Intro\n```ts\nconst x = 1;\n```\nDone")).toEqual([
      { type: "text", content: "Intro" },
      { type: "code", content: "const x = 1;" },
      { type: "text", content: "Done" }
    ]);
  });

  test("isPairingRepairErrorMessage detects broken saved links", () => {
    expect(isPairingRepairErrorMessage("Invalid session token.")).toBe(true);
    expect(isPairingRepairErrorMessage("Paired host not found.")).toBe(true);
    expect(isPairingRepairErrorMessage("Pairing code not found.")).toBe(false);
  });

  test("formatMessageTimestamp returns readable local time", () => {
    expect(formatMessageTimestamp("2026-04-12T21:25:26.551Z")).toMatch(/\d/);
  });
});

function makeSession(overrides: Partial<ChatSession>): ChatSession {
  return {
    id: "session",
    hostId: "host",
    deviceId: "device",
    title: "Chat",
    rootPath: "/tmp",
    threadId: null,
    status: "idle",
    activeTurnId: null,
    stopRequested: false,
    lastError: null,
    createdAt: "2026-04-12T10:00:00.000Z",
    updatedAt: "2026-04-12T10:00:00.000Z",
    ...overrides
  };
}
