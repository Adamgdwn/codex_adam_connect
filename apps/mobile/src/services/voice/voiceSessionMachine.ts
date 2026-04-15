import { sanitizeTextForSpeech } from "../../utils/operatorConsole";

export type VoiceSessionPhase =
  | "idle"
  | "connecting"
  | "listening"
  | "muted"
  | "user-speaking"
  | "processing"
  | "assistant-speaking"
  | "interrupted"
  | "reconnecting"
  | "review"
  | "error";

const DEFAULT_BACKCHANNEL_TERMS = new Set([
  "yeah",
  "yes",
  "yep",
  "yup",
  "ok",
  "okay",
  "kk",
  "cool",
  "right",
  "sure",
  "uh huh",
  "uh-huh",
  "mm hmm",
  "mm-hmm",
  "hmm",
  "mhm",
  "wow",
  "nice",
  "thanks",
  "thank you",
  "haha",
  "ha",
  "lol"
]);

const EXPLICIT_INTERRUPT_TERMS = new Set([
  "stop",
  "wait",
  "hold on",
  "hang on",
  "pause",
  "actually",
  "no wait",
  "no stop",
  "scratch that",
  "change that",
  "change it",
  "redirect"
]);

const ASSISTANT_INTERRUPT_PREFIXES = ["freedom"];

const MIN_NON_EXPLICIT_INTERRUPT_WORDS = 4;
const MIN_NON_EXPLICIT_INTERRUPT_CHARS = 24;

export function normalizeVoiceTranscript(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function mergeVoiceTranscriptSegments(previous: string, next: string): string {
  const normalizedPrevious = normalizeVoiceTranscript(previous);
  const normalizedNext = normalizeVoiceTranscript(next);

  if (!normalizedPrevious) {
    return normalizedNext;
  }

  if (!normalizedNext) {
    return normalizedPrevious;
  }

  if (normalizedNext.startsWith(normalizedPrevious)) {
    return normalizedNext;
  }

  if (normalizedPrevious.startsWith(normalizedNext)) {
    return normalizedPrevious;
  }

  const previousWords = normalizedPrevious.split(/\s+/);
  const nextWords = normalizedNext.split(/\s+/);
  const maxOverlap = Math.min(previousWords.length, nextWords.length);

  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    const previousTail = previousWords.slice(previousWords.length - overlap).join(" ").toLowerCase();
    const nextHead = nextWords.slice(0, overlap).join(" ").toLowerCase();
    if (previousTail === nextHead) {
      return [...previousWords, ...nextWords.slice(overlap)].join(" ");
    }
  }

  return `${normalizedPrevious} ${normalizedNext}`;
}

export function isBackchannelUtterance(text: string, maxWords: number): boolean {
  const normalized = normalizeVoiceTranscript(text).toLowerCase();
  if (!normalized) {
    return false;
  }

  const alphaNumeric = normalized.replace(/[^\p{L}\p{N}\s-]/gu, "").trim();
  if (!alphaNumeric) {
    return true;
  }

  const words = alphaNumeric.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    return false;
  }

  return DEFAULT_BACKCHANNEL_TERMS.has(alphaNumeric);
}

export function shouldInterruptAssistant(text: string, interruptMinChars: number, maxBackchannelWords: number): boolean {
  const normalized = normalizeVoiceTranscript(text);
  if (isExplicitInterruptCue(normalized)) {
    return true;
  }

  if (normalized.length < interruptMinChars) {
    return false;
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length < MIN_NON_EXPLICIT_INTERRUPT_WORDS || normalized.length < MIN_NON_EXPLICIT_INTERRUPT_CHARS) {
    return false;
  }

  return !isBackchannelUtterance(normalized, maxBackchannelWords);
}

export function isLikelyAssistantEcho(transcript: string, assistantDraft: string): boolean {
  const normalizedTranscript = normalizeSpeechComparisonText(transcript);
  const normalizedAssistantDraft = normalizeSpeechComparisonText(assistantDraft);

  if (!normalizedTranscript || !normalizedAssistantDraft) {
    return false;
  }

  if (isExplicitInterruptCue(normalizedTranscript)) {
    return false;
  }

  return normalizedAssistantDraft.includes(normalizedTranscript);
}

export function isExplicitInterruptCue(text: string): boolean {
  const lowered = normalizeVoiceTranscript(text).toLowerCase();
  if (!lowered) {
    return false;
  }

  if (EXPLICIT_INTERRUPT_TERMS.has(lowered)) {
    return true;
  }

  if ([...EXPLICIT_INTERRUPT_TERMS].some((term) => lowered.startsWith(`${term} `))) {
    return true;
  }

  return ASSISTANT_INTERRUPT_PREFIXES.some((prefix) =>
    [...EXPLICIT_INTERRUPT_TERMS].some((term) => lowered.startsWith(`${prefix} ${term}`))
  );
}

export function humanizeVoiceSessionPhase(phase: VoiceSessionPhase): string {
  switch (phase) {
    case "assistant-speaking":
      return "Assistant speaking";
    case "connecting":
      return "Starting voice loop";
    case "error":
      return "Voice needs attention";
    case "interrupted":
      return "Interrupted";
    case "listening":
      return "Listening";
    case "muted":
      return "Muted";
    case "processing":
      return "Thinking";
    case "reconnecting":
      return "Voice reconnecting";
    case "review":
      return "Waiting for review";
    case "user-speaking":
      return "You are speaking";
    default:
      return "Voice idle";
  }
}

export function createSpeechChunk(
  content: string,
  spokenCursor: number,
  minimumChars: number,
  flush: boolean
): { chunk: string; nextCursor: number } | null {
  const sanitized = sanitizeTextForSpeech(content);
  if (!sanitized || spokenCursor >= sanitized.length) {
    return null;
  }

  const remaining = sanitized.slice(spokenCursor);
  const leadingWhitespaceCount = remaining.match(/^\s*/)?.[0].length ?? 0;
  const trimmed = remaining.slice(leadingWhitespaceCount);
  if (!trimmed) {
    return {
      chunk: "",
      nextCursor: sanitized.length
    };
  }

  const sentenceBoundary = findSentenceBoundary(trimmed, minimumChars);
  if (sentenceBoundary === -1 && !flush) {
    return null;
  }

  const endIndex = sentenceBoundary === -1 ? trimmed.length : sentenceBoundary;
  const chunk = trimmed.slice(0, endIndex).trim();
  if (!chunk) {
    return null;
  }

  return {
    chunk,
    nextCursor: spokenCursor + leadingWhitespaceCount + endIndex
  };
}

function findSentenceBoundary(value: string, minimumChars: number): number {
  const punctuationPattern = /[.!?]\s/g;
  let match: RegExpExecArray | null;

  while ((match = punctuationPattern.exec(value)) !== null) {
    const candidateEnd = match.index + 1;
    if (candidateEnd >= minimumChars) {
      return candidateEnd;
    }
  }

  const newlineIndex = value.indexOf("\n");
  if (newlineIndex >= minimumChars) {
    return newlineIndex;
  }

  return -1;
}

function normalizeSpeechComparisonText(value: string): string {
  return sanitizeTextForSpeech(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
