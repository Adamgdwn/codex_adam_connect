import type { ChatMessage, ChatMessageStatus, ChatSession, InputMode } from "@adam-connect/shared";
import { FREEDOM_PRODUCT_NAME, FREEDOM_PRIMARY_SESSION_TITLE, isPrimaryFreedomSessionTitle } from "@adam-connect/shared";

export const OPERATOR_SESSION_TITLE = FREEDOM_PRIMARY_SESSION_TITLE;

const RISKY_VOICE_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdrop table\b/i,
  /\bformat\b/i,
  /\breset\b/i,
  /```/,
  /`[^`]+`/
];

export function isOperatorSession(session: ChatSession): boolean {
  return session.kind === "operator" || isPrimaryFreedomSessionTitle(session.title);
}

export function findOperatorSession(sessions: ChatSession[]): ChatSession | undefined {
  return sessions.find(isOperatorSession);
}

export function sortSessionsForDisplay(sessions: ChatSession[]): ChatSession[] {
  return [...sessions].sort((left, right) => {
    if (isOperatorSession(left) && !isOperatorSession(right)) {
      return -1;
    }
    if (!isOperatorSession(left) && isOperatorSession(right)) {
      return 1;
    }
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

export function pickPreferredSessionId(currentSelected: string | null, sessions: ChatSession[]): string | null {
  if (currentSelected && sessions.some((session) => session.id === currentSelected)) {
    return currentSelected;
  }

  const operatorSession = findOperatorSession(sessions);
  return operatorSession?.id ?? sessions[0]?.id ?? null;
}

export function findSendTargetSession(selectedSessionId: string | null, sessions: ChatSession[]): ChatSession | null {
  const sessionId = pickPreferredSessionId(selectedSessionId, sessions);
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export function findStopTargetSession(selectedSessionId: string | null, sessions: ChatSession[]): ChatSession | null {
  const selectedSession = selectedSessionId ? sessions.find((session) => session.id === selectedSessionId) ?? null : null;
  if (isSessionBusy(selectedSession)) {
    return selectedSession;
  }

  const sendTargetSession = findSendTargetSession(selectedSessionId, sessions);
  if (isSessionBusy(sendTargetSession)) {
    return sendTargetSession;
  }

  return sessions.find((session) => isSessionBusy(session)) ?? null;
}

export function findManualStopTargetSession(selectedSessionId: string | null, sessions: ChatSession[]): ChatSession | null {
  return (
    findStopTargetSession(selectedSessionId, sessions) ??
    (selectedSessionId ? sessions.find((session) => session.id === selectedSessionId) ?? null : null) ??
    findSendTargetSession(selectedSessionId, sessions) ??
    sessions[0] ??
    null
  );
}

export function isSessionBusy(session: ChatSession | null | undefined): boolean {
  return Boolean(session && (session.status === "queued" || session.status === "running" || session.status === "stopping"));
}

export function isQueuedVoiceAutoSendPending(autoSendVoice: boolean, composer: string, composerInputMode: InputMode): boolean {
  return autoSendVoice && composer.trim().length > 0 && composerInputMode === "voice";
}

export function requiresVoiceReview(transcript: string): boolean {
  const value = transcript.trim();
  if (!value) {
    return false;
  }

  if (value.length > 180 || value.includes("\n")) {
    return true;
  }

  return RISKY_VOICE_PATTERNS.some((pattern) => pattern.test(value));
}

export function sanitizeTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " Code block omitted. ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPairingRepairErrorMessage(message: string): boolean {
  return (
    message.includes("Invalid session token.") ||
    message.includes("Paired host not found.") ||
    message.includes("Missing bearer token.")
  );
}

export function pairingRepairMessage(): string {
  return "This phone needs to repair its desktop link. Reconnect using the saved desktop URL and pairing code.";
}

export function splitMessageContent(content: string): Array<{ type: "text" | "code"; content: string }> {
  if (!content.includes("```")) {
    return [{ type: "text", content }];
  }

  const parts: Array<{ type: "text" | "code"; content: string }> = [];
  const pattern = /```([\w-]+)?\n?([\s\S]*?)```/g;
  let lastIndex = 0;

  for (const match of content.matchAll(pattern)) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      const textBlock = content.slice(lastIndex, startIndex).trim();
      if (textBlock) {
        parts.push({ type: "text", content: textBlock });
      }
    }

    const codeBlock = (match[2] ?? "").trim();
    parts.push({ type: "code", content: codeBlock || "Code block" });
    lastIndex = startIndex + match[0].length;
  }

  const trailingText = content.slice(lastIndex).trim();
  if (trailingText) {
    parts.push({ type: "text", content: trailingText });
  }

  return parts.length ? parts : [{ type: "text", content }];
}

export function formatMessageTimestamp(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

export function humanizeMessageRole(message: ChatMessage): string {
  if (message.role === "user") {
    return "You";
  }
  if (message.role === "assistant") {
    return FREEDOM_PRODUCT_NAME;
  }
  return "System";
}

export function humanizeMessageStatus(status: ChatMessageStatus): string {
  switch (status) {
    case "pending":
      return "Queued";
    case "streaming":
      return "Streaming";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "interrupted":
      return "Interrupted";
    default:
      return status;
  }
}
