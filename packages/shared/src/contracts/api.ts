import type {
  ChatMessage,
  ChatSession,
  CreateOutboundRecipientRequest,
  CreateSessionRequest,
  HostAssistantDeltaRequest,
  HostCompleteTurnRequest,
  HostFailTurnRequest,
  HostHeartbeatRequest,
  HostInterruptTurnRequest,
  HostStartTurnRequest,
  HostStatus,
  HostWorkItem,
  OutboundRecipient,
  PairingCompleteResponse,
  PairedDevice,
  PostMessageRequest,
  RealtimeTicketResponse,
  RegisterPushTokenRequest,
  RegisterHostRequest,
  RegisterHostResponse,
  SendExternalMessageRequest,
  SendExternalMessageResponse
} from "../schemas/platform.js";
import type {
  NotificationEvent,
  RenameDeviceRequest,
  UpdateNotificationPrefsRequest,
  UpdateSessionRequest
} from "../schemas/platform.js";

export interface MobileApi {
  completePairing(baseUrl: string, pairingCode: string, deviceName: string): Promise<PairingCompleteResponse>;
  getHostStatus(token: string): Promise<HostStatus>;
  listSessions(token: string): Promise<ChatSession[]>;
  listDevices(token: string): Promise<PairedDevice[]>;
  createSession(token: string, input: CreateSessionRequest): Promise<ChatSession>;
  updateSession(token: string, sessionId: string, input: UpdateSessionRequest): Promise<ChatSession>;
  deleteSession(token: string, sessionId: string): Promise<{ ok: true; deletedSessionId: string }>;
  listMessages(token: string, sessionId: string): Promise<ChatMessage[]>;
  postMessage(token: string, sessionId: string, input: PostMessageRequest): Promise<ChatMessage>;
  stopSession(token: string, sessionId: string): Promise<ChatSession>;
  createRealtimeTicket(token: string): Promise<RealtimeTicketResponse>;
  renameDevice(token: string, deviceId: string, input: RenameDeviceRequest): Promise<PairedDevice>;
  revokeDevice(token: string, deviceId: string): Promise<PairedDevice>;
  registerPushToken(token: string, deviceId: string, input: RegisterPushTokenRequest): Promise<PairedDevice>;
  updateNotificationPrefs(token: string, deviceId: string, input: UpdateNotificationPrefsRequest): Promise<PairedDevice>;
  sendTestNotification(token: string, deviceId: string, event: NotificationEvent): Promise<{ ok: true; deviceId: string }>;
  listOutboundRecipients(token: string): Promise<OutboundRecipient[]>;
  createOutboundRecipient(token: string, input: CreateOutboundRecipientRequest): Promise<OutboundRecipient>;
  deleteOutboundRecipient(token: string, recipientId: string): Promise<{ ok: true; deletedRecipientId: string }>;
  sendExternalMessage(token: string, input: SendExternalMessageRequest): Promise<SendExternalMessageResponse>;
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
