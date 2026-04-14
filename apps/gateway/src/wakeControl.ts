import type { WakeControl } from "@adam-connect/shared";

export function resolveWakeControl(env: NodeJS.ProcessEnv): WakeControl {
  const relayBaseUrl = normalizeUrl(env.WAKE_RELAY_BASE_URL);
  const relayToken = normalizeOptional(env.WAKE_RELAY_TOKEN);
  const targetId = normalizeOptional(env.WAKE_RELAY_TARGET_ID);
  const targetLabel = normalizeOptional(env.WAKE_RELAY_TARGET_LABEL);
  const enabled = Boolean(relayBaseUrl && relayToken && targetId);

  return {
    enabled,
    relayBaseUrl: enabled ? relayBaseUrl : null,
    relayToken: enabled ? relayToken : null,
    targetId: enabled ? targetId : null,
    targetLabel: enabled ? targetLabel ?? "Homebase" : null
  };
}

function normalizeUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\/+$/, "");
}

function normalizeOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
