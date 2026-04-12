import type {
  ChatMessage,
  ChatSession,
  CreateSessionRequest,
  HostAssistantDeltaRequest,
  HostCompleteTurnRequest,
  HostFailTurnRequest,
  HostHeartbeatRequest,
  HostInterruptTurnRequest,
  HostStartTurnRequest,
  HostStatus,
  HostWorkItem,
  PairingCompleteResponse,
  PostMessageRequest,
  RegisterHostRequest,
  RegisterHostResponse
} from "../schemas/platform.js";

export interface MobileApi {
  completePairing(baseUrl: string, pairingCode: string, deviceName: string): Promise<PairingCompleteResponse>;
  getHostStatus(token: string): Promise<HostStatus>;
  listSessions(token: string): Promise<ChatSession[]>;
  createSession(token: string, input: CreateSessionRequest): Promise<ChatSession>;
  listMessages(token: string, sessionId: string): Promise<ChatMessage[]>;
  postMessage(token: string, sessionId: string, input: PostMessageRequest): Promise<ChatMessage>;
  stopSession(token: string, sessionId: string): Promise<ChatSession>;
}

export interface HostApi {
  registerHost(input: RegisterHostRequest): Promise<RegisterHostResponse>;
  heartbeat(token: string, input: HostHeartbeatRequest): Promise<HostStatus>;
  getNextWork(token: string): Promise<HostWorkItem | null>;
  startTurn(token: string, input: HostStartTurnRequest): Promise<ChatSession>;
  appendAssistantDelta(token: string, input: HostAssistantDeltaRequest): Promise<ChatMessage>;
  completeTurn(token: string, input: HostCompleteTurnRequest): Promise<ChatSession>;
  failTurn(token: string, input: HostFailTurnRequest): Promise<ChatSession>;
  interruptTurn(token: string, input: HostInterruptTurnRequest): Promise<ChatSession>;
  getHostStatus(token: string): Promise<HostStatus>;
}
