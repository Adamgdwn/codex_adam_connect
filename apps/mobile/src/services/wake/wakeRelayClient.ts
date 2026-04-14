import type { WakeControl, WakeRelayResponse } from "@adam-connect/shared";

export class WakeRelayClient {
  async wake(config: WakeControl): Promise<WakeRelayResponse> {
    if (!config.enabled || !config.relayBaseUrl || !config.relayToken || !config.targetId) {
      throw new Error("Wake relay is not configured on this desktop yet.");
    }

    let response: Response;
    try {
      response = await fetch(`${config.relayBaseUrl}/wake`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.relayToken}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          targetId: config.targetId
        })
      });
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : "network request failed";
      throw new Error(`Could not reach the wake relay at ${config.relayBaseUrl}. ${detail}`);
    }

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;
    if (!response.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "error" in parsed &&
        typeof (parsed as { error?: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : `Wake relay error (${response.status})`;
      throw new Error(message);
    }

    return parsed as WakeRelayResponse;
  }
}
