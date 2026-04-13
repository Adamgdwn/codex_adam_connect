import { buildProjectStarterPrompt, buildTurnPrompt } from "@adam-connect/shared";
import type { ChatSession } from "@adam-connect/shared";
import {
  findManualStopTargetSession,
  findSendTargetSession,
  findStopTargetSession,
  formatMessageTimestamp,
  isQueuedVoiceAutoSendPending,
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

  test("findSendTargetSession prefers the selected chat and falls back to Operator", () => {
    const sessions = [
      makeSession({ id: "2", title: "Project", updatedAt: "2026-04-12T12:00:00.000Z" }),
      makeSession({ id: "1", title: "Operator", updatedAt: "2026-04-12T11:00:00.000Z" })
    ];

    expect(findSendTargetSession("2", sessions)?.id).toBe("2");
    expect(findSendTargetSession(null, sessions)?.id).toBe("1");
  });

  test("findStopTargetSession falls back to the actually busy chat", () => {
    const sessions = [
      makeSession({ id: "1", title: "Operator", status: "running", updatedAt: "2026-04-12T11:00:00.000Z" }),
      makeSession({ id: "2", title: "Notes", status: "idle", updatedAt: "2026-04-12T12:00:00.000Z" })
    ];

    expect(findStopTargetSession("2", sessions)?.id).toBe("1");
    expect(findStopTargetSession("1", sessions)?.id).toBe("1");
  });

  test("findManualStopTargetSession falls back to the selected or latest chat for recovery", () => {
    const sessions = [
      makeSession({ id: "1", title: "Operator", status: "idle", updatedAt: "2026-04-12T11:00:00.000Z" }),
      makeSession({ id: "2", title: "Notes", status: "idle", updatedAt: "2026-04-12T12:00:00.000Z" })
    ];

    expect(findManualStopTargetSession("2", sessions)?.id).toBe("2");
    expect(findManualStopTargetSession(null, sessions)?.id).toBe("1");
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

  test("buildProjectStarterPrompt includes project setup context", () => {
    const prompt = buildProjectStarterPrompt({
      projectName: "Remote operator UI",
      rootPath: "/tmp/project",
      intent: "Design and implement a better mobile control surface.",
      desiredOutputType: "implementation plan",
      starterInstructions: "Keep the first slice safe for live testing.",
      templateId: "greenfield",
      responseStyle: "technical"
    });

    expect(prompt).toContain("Project name: Remote operator UI");
    expect(prompt).toContain("Workspace root: /tmp/project");
    expect(prompt).toContain("Preferred response style: technical.");
  });

  test("buildTurnPrompt carries response style and voice context", () => {
    const prompt = buildTurnPrompt({
      sessionTitle: "Operator",
      sessionKind: "operator",
      userText: "check the repo status",
      responseStyle: "concise",
      inputMode: "voice_polished",
      transcriptPolished: true
    });

    expect(prompt).toContain("Preferred response style: concise");
    expect(prompt).toContain("reviewed voice transcript");
    expect(prompt).toContain("User request:\ncheck the repo status");
  });

  test("isQueuedVoiceAutoSendPending only returns true for queued voice drafts", () => {
    expect(isQueuedVoiceAutoSendPending(true, "check the repo status", "voice")).toBe(true);
    expect(isQueuedVoiceAutoSendPending(false, "check the repo status", "voice")).toBe(false);
    expect(isQueuedVoiceAutoSendPending(true, "check the repo status", "text")).toBe(false);
    expect(isQueuedVoiceAutoSendPending(true, "   ", "voice")).toBe(false);
  });
});

function makeSession(overrides: Partial<ChatSession>): ChatSession {
  return {
    id: "session",
    hostId: "host",
    deviceId: "device",
    title: "Chat",
    kind: "project",
    pinned: false,
    archived: false,
    rootPath: "/tmp",
    threadId: null,
    status: "idle",
    activeTurnId: null,
    stopRequested: false,
    lastError: null,
    lastPreview: null,
    lastActivityAt: "2026-04-12T10:00:00.000Z",
    createdAt: "2026-04-12T10:00:00.000Z",
    updatedAt: "2026-04-12T10:00:00.000Z",
    ...overrides
  };
}
