import type {
  ChatMessage,
  ChatSession,
  CreateSessionRequest,
  HostStatus,
  PairingCompleteResponse,
  PostMessageRequest
} from "@adam-connect/shared";

export class ApiClient {
  async completePairing(baseUrl: string, pairingCode: string, deviceName: string): Promise<PairingCompleteResponse> {
    return this.request("POST", `${baseUrl}/pairing/complete`, undefined, {
      pairingCode,
      deviceName
    });
  }

  getHostStatus(token: string, baseUrl: string): Promise<HostStatus> {
    return this.request("GET", `${baseUrl}/host/status`, token);
  }

  listSessions(token: string, baseUrl: string): Promise<ChatSession[]> {
    return this.request("GET", `${baseUrl}/sessions`, token);
  }

  createSession(token: string, baseUrl: string, input: CreateSessionRequest): Promise<ChatSession> {
    return this.request("POST", `${baseUrl}/sessions`, token, input);
  }

  listMessages(token: string, baseUrl: string, sessionId: string): Promise<ChatMessage[]> {
    return this.request("GET", `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/messages`, token);
  }

  postMessage(token: string, baseUrl: string, sessionId: string, input: PostMessageRequest): Promise<ChatMessage> {
    return this.request("POST", `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/messages`, token, input);
  }

  stopSession(token: string, baseUrl: string, sessionId: string): Promise<ChatSession> {
    return this.request("POST", `${baseUrl}/sessions/${encodeURIComponent(sessionId)}/stop`, token);
  }

  private async request<T>(method: string, url: string, token?: string, body?: unknown): Promise<T> {
    const response = await fetch(url, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as unknown) : null;

    if (!response.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "error" in parsed &&
        typeof (parsed as { error?: unknown }).error === "string"
          ? (parsed as { error: string }).error
          : `API error (${response.status})`;
      throw new Error(message);
    }

    return parsed as T;
  }
}
