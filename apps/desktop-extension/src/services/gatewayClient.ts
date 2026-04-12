import type {
  ChatMessage,
  ChatSession,
  HostApi,
  HostAssistantDeltaRequest,
  HostCompleteTurnRequest,
  HostFailTurnRequest,
  HostHeartbeatRequest,
  HostInterruptTurnRequest,
  HostStartTurnRequest,
  HostStatus,
  HostWorkItem,
  RegisterHostRequest,
  RegisterHostResponse
} from "@adam-connect/shared";

export class HttpGatewayClient implements HostApi {
  constructor(private readonly baseUrl: string) {}

  registerHost(input: RegisterHostRequest): Promise<RegisterHostResponse> {
    return this.request("POST", "/host/register", undefined, input);
  }

  heartbeat(token: string, input: HostHeartbeatRequest): Promise<HostStatus> {
    return this.request("POST", "/host/heartbeat", token, input);
  }

  getNextWork(token: string): Promise<HostWorkItem | null> {
    return this.request("GET", "/host/work", token);
  }

  startTurn(token: string, input: HostStartTurnRequest): Promise<ChatSession> {
    return this.request("POST", "/host/turn/start", token, input);
  }

  appendAssistantDelta(token: string, input: HostAssistantDeltaRequest): Promise<ChatMessage> {
    return this.request("POST", "/host/turn/delta", token, input);
  }

  completeTurn(token: string, input: HostCompleteTurnRequest): Promise<ChatSession> {
    return this.request("POST", "/host/turn/complete", token, input);
  }

  failTurn(token: string, input: HostFailTurnRequest): Promise<ChatSession> {
    return this.request("POST", "/host/turn/fail", token, input);
  }

  interruptTurn(token: string, input: HostInterruptTurnRequest): Promise<ChatSession> {
    return this.request("POST", "/host/turn/interrupt", token, input);
  }

  getHostStatus(token: string): Promise<HostStatus> {
    return this.request("GET", "/host/status", token);
  }

  private async request<T>(method: string, pathname: string, token?: string, body?: unknown): Promise<T> {
    const response = await fetch(new URL(pathname, this.baseUrl), {
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
          : `Gateway error (${response.status})`;
      throw new Error(message);
    }

    return parsed as T;
  }
}
