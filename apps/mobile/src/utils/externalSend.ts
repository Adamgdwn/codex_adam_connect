import type { OutboundRecipient } from "@adam-connect/shared";

export interface ParsedExternalSendRequest {
  recipientId: string | null;
  recipientLabel: string | null;
  recipientDestination: string;
  matchReason: "explicit_email" | "trusted_recipient" | "single_recipient_me";
  requestedSubject: string | null;
  requestedBody: string | null;
}

const EMAIL_REGEX = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const EXTERNAL_SEND_VERB_REGEX = /\b(email|e-mail|mail|send)\b/i;
const EMAIL_ME_REGEX = /\b(email|send|mail)\s+me\b/i;
const CONFIRM_SEND_REGEX = /^(?:yes|yep|yeah|send(?: it| that| the email)?|go ahead|do it|please send(?: it| that| the email)?|confirm(?: send)?)\b/i;
const CANCEL_SEND_REGEX = /^(?:cancel|don't send|do not send|never mind|nevermind|stop|hold off)\b/i;

export function parseExternalSendRequest(text: string, recipients: OutboundRecipient[]): ParsedExternalSendRequest | null {
  const normalized = text.trim();
  if (!normalized || !EXTERNAL_SEND_VERB_REGEX.test(normalized)) {
    return null;
  }

  const requestedSubject = extractRequestedField(normalized, "subject");
  const requestedBody = extractRequestedField(normalized, "body") ?? extractRequestedField(normalized, "message");

  const explicitEmail = normalized.match(EMAIL_REGEX)?.[0]?.toLowerCase() ?? null;
  if (explicitEmail) {
    const matchingRecipient = recipients.find((recipient) => recipient.destination.toLowerCase() === explicitEmail) ?? null;
    return {
      recipientId: matchingRecipient?.id ?? null,
      recipientLabel: matchingRecipient?.label ?? null,
      recipientDestination: matchingRecipient?.destination ?? explicitEmail,
      matchReason: matchingRecipient ? "trusted_recipient" : "explicit_email",
      requestedSubject,
      requestedBody
    };
  }

  const lower = normalized.toLowerCase();
  const labelMatch =
    recipients.find((recipient) => {
      const label = recipient.label.trim().toLowerCase();
      return label.length > 1 && lower.includes(label);
    }) ?? null;
  if (labelMatch) {
    return {
      recipientId: labelMatch.id,
      recipientLabel: labelMatch.label,
      recipientDestination: labelMatch.destination,
      matchReason: "trusted_recipient",
      requestedSubject,
      requestedBody
    };
  }

  if (EMAIL_ME_REGEX.test(normalized) && recipients.length === 1) {
    return {
      recipientId: recipients[0]?.id ?? null,
      recipientLabel: recipients[0]?.label ?? null,
      recipientDestination: recipients[0]?.destination ?? "",
      matchReason: "single_recipient_me",
      requestedSubject,
      requestedBody
    };
  }

  return null;
}

export function isExternalSendConfirmation(text: string): boolean {
  return CONFIRM_SEND_REGEX.test(text.trim());
}

export function isExternalSendCancellation(text: string): boolean {
  return CANCEL_SEND_REGEX.test(text.trim());
}

export function isValidExternalEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

function extractRequestedField(text: string, fieldName: "subject" | "body" | "message"): string | null {
  const patterns = [
    new RegExp(`${fieldName}\\s*[:=-]\\s*["“]?([^"”\\n]+)["”]?`, "i"),
    new RegExp(`${fieldName}\\s+(?:is|as)\\s+["“]?([^"”\\n]+)["”]?`, "i")
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern)?.[1]?.trim();
    if (match) {
      return match.replace(/[.,;:]$/, "").trim();
    }
  }

  return null;
}
