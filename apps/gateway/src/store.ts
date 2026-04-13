import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId, generatePairingCode, nowIso } from "@adam-connect/core";
import type {
  AuditEvent,
  ChatMessage,
  ChatSession,
  CreateSessionRequest,
  GatewayOverview,
  HostAssistantDeltaRequest,
  HostAvailability,
  HostAuthState,
  HostCompleteTurnRequest,
  HostFailTurnRequest,
  HostHeartbeatRequest,
  HostInterruptTurnRequest,
  HostStartTurnRequest,
  HostStatus,
  HostWorkItem,
  NotificationEvent,
  NotificationPrefs,
  PairingCompleteResponse,
  PairedDevice,
  PostMessageRequest,
  RecentSessionActivity,
  RegisterHostRequest,
  RegisterHostResponse,
  RegisterPushTokenRequest,
  RealtimeTicketResponse,
  RenameDeviceRequest,
  RepairState,
  RegisteredHost,
  RunState,
  StreamEvent,
  TailscaleStatus,
  UpdateNotificationPrefsRequest,
  UpdateSessionRequest
} from "@adam-connect/shared";

interface HostRecord extends RegisteredHost {
  auth: HostAuthState;
  tailscale: TailscaleStatus;
  hostToken: string;
}

interface DeviceRecord extends PairedDevice {
  deviceToken: string;
}

interface SessionRecord extends ChatSession {
  claimedMessageId: string | null;
  stopClaimedAt: string | null;
}

interface GatewayState {
  hosts: HostRecord[];
  devices: DeviceRecord[];
  sessions: SessionRecord[];
  messages: ChatMessage[];
  auditEvents: AuditEvent[];
}

type Principal =
  | { kind: "host"; host: HostRecord }
  | { kind: "device"; host: HostRecord; device: DeviceRecord };

interface BroadcastEnvelope {
  hostId: string;
  event: StreamEvent;
}

interface RealtimeTicketRecord {
  hostId: string;
  expiresAt: string;
}

const defaultAuthState: HostAuthState = {
  status: "logged_out",
  detail: "Desktop host has not reported Codex auth yet."
};

const defaultTailscaleStatus: TailscaleStatus = {
  installed: false,
  connected: false,
  detail: "Desktop host has not reported Tailscale status yet.",
  dnsName: null,
  ipv4: null,
  suggestedUrl: null,
  transportSecurity: "insecure",
  installUrl: "https://tailscale.com/download",
  loginUrl: "https://login.tailscale.com/start"
};

const defaultNotificationPrefs: NotificationPrefs = {
  run_complete: true,
  run_failed: true,
  repair_needed: true,
  approval_needed: true
};

const INTERRUPT_RECLAIM_MS = 5_000;

const defaultState = (): GatewayState => ({
  hosts: [],
  devices: [],
  sessions: [],
  messages: [],
  auditEvents: []
});

export class GatewayStore {
  private readonly dataFile: string;
  private readonly events = new EventEmitter();
  private state: GatewayState | null = null;
  private readonly realtimeTickets = new Map<string, RealtimeTicketRecord>();

  constructor(private readonly dataDir: string) {
    this.dataFile = path.join(dataDir, "state.json");
  }

  onBroadcast(listener: (payload: BroadcastEnvelope) => void): () => void {
    this.events.on("broadcast", listener);
    return () => {
      this.events.off("broadcast", listener);
    };
  }

  async registerHost(input: RegisterHostRequest): Promise<RegisterHostResponse> {
    const state = await this.readState();
    const issuedAt = nowIso();
    let host =
      (input.hostId ? state.hosts.find((item) => item.id === input.hostId) : null) ??
      state.hosts.find((item) => item.hostName === input.hostName);

    if (!host) {
      const pairingCode = generatePairingCode();
      host = {
        id: createId("host"),
        hostName: input.hostName,
        approvedRoots: input.approvedRoots,
        pairingCode,
        pairingCodeIssuedAt: issuedAt,
        createdAt: issuedAt,
        lastSeenAt: issuedAt,
        isOnline: true,
        auth: defaultAuthState,
        tailscale: defaultTailscaleStatus,
        hostToken: createId("hosttoken")
      };
      state.hosts.push(host);
    } else {
      host.approvedRoots = input.approvedRoots;
      host.pairingCode = host.pairingCode || generatePairingCode();
      host.pairingCodeIssuedAt = host.pairingCodeIssuedAt || issuedAt;
      host.lastSeenAt = issuedAt;
      host.isOnline = true;
      host.hostToken = createId("hosttoken");
    }

    this.addAuditEvent(state, {
      hostId: host.id,
      deviceId: null,
      sessionId: null,
      type: "host_registered",
      detail: host.hostName
    });
    await this.writeState(state);
    this.emitHostStatus(host);

    return {
      host: toPublicHost(host),
      hostToken: host.hostToken,
      pairingCode: host.pairingCode
    };
  }

  async completePairing(pairingCode: string, deviceName: string): Promise<PairingCompleteResponse> {
    const state = await this.readState();
    const host = state.hosts.find((item) => item.pairingCode === pairingCode);

    if (!host) {
      throw new Error("Pairing code not found.");
    }

    const now = nowIso();
    let device = state.devices.find((item) => item.hostId === host.id && item.deviceName === deviceName);

    if (!device) {
      device = {
        id: createId("device"),
        hostId: host.id,
        deviceName,
        pushToken: null,
        notificationPrefs: defaultNotificationPrefs,
        revokedAt: null,
        lastNotificationAt: null,
        repairCount: 0,
        repairedAt: null,
        createdAt: now,
        lastSeenAt: now,
        deviceToken: createId("devicetoken")
      };
      state.devices.push(device);
      this.recoverSiblingSessions(state, host, device);
      this.addAuditEvent(state, {
        hostId: host.id,
        deviceId: device.id,
        sessionId: null,
        type: "device_paired",
        detail: device.deviceName
      });
    } else {
      device.lastSeenAt = now;
      device.deviceToken = createId("devicetoken");
      device.revokedAt = null;
      device.repairCount += 1;
      device.repairedAt = now;
      this.addAuditEvent(state, {
        hostId: host.id,
        deviceId: device.id,
        sessionId: null,
        type: "device_repaired",
        detail: device.deviceName
      });
    }

    await this.writeState(state);
    this.emitHostStatus(host);

    return {
      deviceToken: device.deviceToken,
      device: toPublicDevice(device),
      host: toPublicHost(host)
    };
  }

  async getHostStatus(token: string): Promise<HostStatus> {
    const principal = await this.requirePrincipal(token);
    if (principal.kind === "device") {
      await this.touchDevice(principal.device);
      return this.buildHostStatus(principal.host.id);
    }
    return this.buildHostStatus(principal.host.id);
  }

  async getTokenHostId(token: string): Promise<string> {
    const principal = await this.requirePrincipal(token);
    return principal.host.id;
  }

  async createRealtimeTicket(token: string): Promise<RealtimeTicketResponse> {
    const principal = await this.requirePrincipal(token);
    const ticket = createId("realtime");
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    this.realtimeTickets.set(ticket, {
      hostId: principal.host.id,
      expiresAt
    });
    return { ticket, expiresAt };
  }

  async consumeRealtimeTicket(ticket: string): Promise<string> {
    const record = this.realtimeTickets.get(ticket);
    if (!record) {
      throw new Error("Realtime ticket not found.");
    }
    this.realtimeTickets.delete(ticket);
    if (Date.now() >= new Date(record.expiresAt).getTime()) {
      throw new Error("Realtime ticket expired.");
    }
    return record.hostId;
  }

  async heartbeat(token: string, input: HostHeartbeatRequest): Promise<HostStatus> {
    const principal = await this.requireHost(token);
    principal.host.lastSeenAt = nowIso();
    principal.host.isOnline = true;
    principal.host.auth = input.auth;
    principal.host.tailscale = input.tailscale;
    await this.writeState(await this.readState());
    this.emitHostStatus(principal.host);
    return this.buildHostStatus(principal.host.id);
  }

  async listDevices(token: string): Promise<PairedDevice[]> {
    const principal = await this.requireDevice(token);
    await this.touchDevice(principal.device);
    return (await this.readState()).devices
      .filter((item) => item.hostId === principal.host.id && !item.revokedAt)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .map(toPublicDevice);
  }

  async renameDevice(token: string, deviceId: string, input: RenameDeviceRequest): Promise<PairedDevice> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const device = state.devices.find((item) => item.id === deviceId && item.hostId === principal.host.id && !item.revokedAt);
    if (!device) {
      throw new Error("Device not found.");
    }
    device.deviceName = input.deviceName.trim();
    device.lastSeenAt = nowIso();
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: device.id,
      sessionId: null,
      type: "device_renamed",
      detail: device.deviceName
    });
    await this.writeState(state);
    this.emitHostStatus(principal.host);
    return toPublicDevice(device);
  }

  async revokeDevice(token: string, deviceId: string): Promise<PairedDevice> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const device = state.devices.find((item) => item.id === deviceId && item.hostId === principal.host.id && !item.revokedAt);
    if (!device) {
      throw new Error("Device not found.");
    }
    device.revokedAt = nowIso();
    device.deviceToken = createId("revoked");
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: device.id,
      sessionId: null,
      type: "device_revoked",
      detail: device.deviceName
    });
    await this.writeState(state);
    this.emitHostStatus(principal.host);
    return toPublicDevice(device);
  }

  async registerPushToken(token: string, deviceId: string, input: RegisterPushTokenRequest): Promise<PairedDevice> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const device = state.devices.find((item) => item.id === deviceId && item.hostId === principal.host.id && !item.revokedAt);
    if (!device) {
      throw new Error("Device not found.");
    }
    device.pushToken = input.pushToken.trim();
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: device.id,
      sessionId: null,
      type: "push_token_registered",
      detail: device.deviceName
    });
    await this.writeState(state);
    return toPublicDevice(device);
  }

  async updateNotificationPrefs(
    token: string,
    deviceId: string,
    input: UpdateNotificationPrefsRequest
  ): Promise<PairedDevice> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const device = state.devices.find((item) => item.id === deviceId && item.hostId === principal.host.id && !item.revokedAt);
    if (!device) {
      throw new Error("Device not found.");
    }
    device.notificationPrefs = input;
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: device.id,
      sessionId: null,
      type: "notification_prefs_updated",
      detail: device.deviceName
    });
    await this.writeState(state);
    return toPublicDevice(device);
  }

  async sendTestNotification(token: string, deviceId: string, event: NotificationEvent): Promise<{ ok: true; deviceId: string }> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const device = state.devices.find((item) => item.id === deviceId && item.hostId === principal.host.id && !item.revokedAt);
    if (!device) {
      throw new Error("Device not found.");
    }
    await this.sendNotification(state, principal.host.id, device, event, "Adam Connect test notification");
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: device.id,
      sessionId: null,
      type: "notification_test_sent",
      detail: event
    });
    await this.writeState(state);
    return { ok: true, deviceId };
  }

  async listSessions(token: string): Promise<ChatSession[]> {
    const principal = await this.requireDevice(token);
    await this.touchDevice(principal.device);
    return (await this.readState()).sessions
      .filter((item) => item.deviceId === principal.device.id && !item.archived)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(toPublicSession);
  }

  async createSession(token: string, input: CreateSessionRequest): Promise<ChatSession> {
    const principal = await this.requireDevice(token);
    const state = await this.readState();
    const rootPath = input.rootPath ?? principal.host.approvedRoots[0];

    if (!principal.host.approvedRoots.includes(rootPath)) {
      throw new Error("Requested root is not approved for this host.");
    }

    const now = nowIso();
    const existingCount = state.sessions.filter((item) => item.deviceId === principal.device.id).length;
    const session: SessionRecord = {
      id: createId("session"),
      hostId: principal.host.id,
      deviceId: principal.device.id,
      title: input.title?.trim() || `Chat ${existingCount + 1}`,
      kind: input.kind ?? "project",
      pinned: input.kind === "operator",
      archived: false,
      rootPath,
      threadId: null,
      status: "idle",
      activeTurnId: null,
      stopRequested: false,
      lastError: null,
      lastPreview: input.starterPrompt?.trim() || null,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
      claimedMessageId: null,
      stopClaimedAt: null
    };

    state.sessions.push(session);
    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: principal.device.id,
      sessionId: session.id,
      type: "session_created",
      detail: `${session.kind}:${session.title}`
    });
    await this.writeState(state);
    this.emitSession(session);
    return toPublicSession(session);
  }

  async updateSession(token: string, sessionId: string, input: UpdateSessionRequest): Promise<ChatSession> {
    const principal = await this.requireDevice(token);
    const session = await this.requireSessionForDevice(sessionId, principal.device.id);
    const state = await this.readState();
    const targetSession = state.sessions.find((item) => item.id === session.id);
    if (!targetSession) {
      throw new Error("Session not found.");
    }

    targetSession.title = input.title.trim();
    targetSession.updatedAt = nowIso();

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: principal.device.id,
      sessionId: targetSession.id,
      type: "session_renamed",
      detail: targetSession.title
    });
    await this.writeState(state);
    this.emitSession(targetSession);
    return toPublicSession(targetSession);
  }

  async deleteSession(token: string, sessionId: string): Promise<{ ok: true; deletedSessionId: string }> {
    const principal = await this.requireDevice(token);
    const session = await this.requireSessionForDevice(sessionId, principal.device.id);
    const state = await this.readState();

    state.sessions = state.sessions.filter((item) => item.id !== session.id);
    state.messages = state.messages.filter((item) => item.sessionId !== session.id);

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: principal.device.id,
      sessionId: session.id,
      type: "session_deleted",
      detail: session.title
    });
    await this.writeState(state);
    return { ok: true, deletedSessionId: session.id };
  }

  async listMessages(token: string, sessionId: string): Promise<ChatMessage[]> {
    const principal = await this.requireDevice(token);
    const session = await this.requireSessionForDevice(sessionId, principal.device.id);
    return (await this.readState()).messages
      .filter((item) => item.sessionId === session.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async postMessage(token: string, sessionId: string, input: PostMessageRequest): Promise<ChatMessage> {
    const principal = await this.requireDevice(token);
    const session = await this.requireSessionForDevice(sessionId, principal.device.id);

    if (session.activeTurnId || session.status === "queued" || session.status === "stopping") {
      throw new Error("This chat is busy. Wait for the current run to finish or stop it first.");
    }

    const state = await this.readState();
    const now = nowIso();
    const message: ChatMessage = {
      id: createId("msg"),
      sessionId: session.id,
      role: "user",
      content: input.text.trim(),
      status: "pending",
      errorMessage: null,
      inputMode: input.inputMode ?? "text",
      responseStyle: input.responseStyle ?? "natural",
      transcriptPolished: input.transcriptPolished ?? false,
      createdAt: now,
      updatedAt: now
    };

    state.messages.push(message);
    const targetSession = state.sessions.find((item) => item.id === session.id);
    if (!targetSession) {
      throw new Error("Session not found.");
    }
    targetSession.status = "queued";
    targetSession.updatedAt = now;
    targetSession.lastError = null;
    targetSession.lastPreview = truncatePreview(input.text.trim());
    targetSession.lastActivityAt = now;

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: principal.device.id,
      sessionId: targetSession.id,
      type: "message_posted",
      detail: `${input.inputMode ?? "text"}:${input.responseStyle ?? "natural"}`
    });
    await this.writeState(state);
    this.emitMessage(principal.host.id, message);
    this.emitSession(targetSession);
    return message;
  }

  async stopSession(token: string, sessionId: string): Promise<ChatSession> {
    const principal = await this.requireDevice(token);
    const session = await this.requireSessionForDevice(sessionId, principal.device.id);
    const state = await this.readState();
    const targetSession = state.sessions.find((item) => item.id === session.id);
    if (!targetSession) {
      throw new Error("Session not found.");
    }

    if (targetSession.activeTurnId) {
      targetSession.stopRequested = true;
      targetSession.status = "stopping";
      targetSession.stopClaimedAt = null;
      targetSession.updatedAt = nowIso();
    } else {
      const pending = [...state.messages]
        .reverse()
        .find((item: ChatMessage) => item.sessionId === session.id && item.role === "user" && item.status === "pending");
      if (pending) {
        pending.status = "interrupted";
        pending.updatedAt = nowIso();
        pending.errorMessage = "Cancelled before Codex started running.";
        this.emitMessage(principal.host.id, pending);
      }
      targetSession.status = "idle";
      targetSession.updatedAt = nowIso();
    }

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: principal.device.id,
      sessionId: targetSession.id,
      type: "stop_requested",
      detail: targetSession.title
    });
    await this.writeState(state);
    this.emitSession(targetSession);
    return toPublicSession(targetSession);
  }

  async getNextWork(token: string): Promise<HostWorkItem | null> {
    const principal = await this.requireHost(token);
    const state = await this.readState();

    const interruptSession = state.sessions.find(
      (item) =>
        item.hostId === principal.host.id &&
        item.activeTurnId &&
        item.stopRequested &&
        (!item.stopClaimedAt || isInterruptClaimStale(item.stopClaimedAt))
    );
    if (interruptSession) {
      interruptSession.stopClaimedAt = nowIso();
      await this.writeState(state);
      return {
        type: "interrupt",
        session: toPublicSession(interruptSession),
        turnId: interruptSession.activeTurnId ?? ""
      };
    }

    const pendingSession = state.sessions.find(
      (item) => item.hostId === principal.host.id && item.status === "queued" && !item.activeTurnId && !item.claimedMessageId
    );
    if (!pendingSession) {
      return null;
    }

    const message = state.messages.find(
      (item) => item.sessionId === pendingSession.id && item.role === "user" && item.status === "pending"
    );
    if (!message) {
      pendingSession.status = "idle";
      pendingSession.updatedAt = nowIso();
      await this.writeState(state);
      this.emitSession(pendingSession);
      return null;
    }

    pendingSession.claimedMessageId = message.id;
    await this.writeState(state);
    return {
      type: "message",
      session: toPublicSession(pendingSession),
      message
    };
  }

  async startTurn(token: string, input: HostStartTurnRequest): Promise<ChatSession> {
    const principal = await this.requireHost(token);
    const state = await this.readState();
    const session = this.requireSessionForHostState(state, input.sessionId, principal.host.id);
    const userMessage = this.requireMessage(state, input.userMessageId, input.sessionId);

    userMessage.status = "completed";
    userMessage.updatedAt = nowIso();
    userMessage.errorMessage = null;

    const assistantMessage: ChatMessage = {
      id: input.assistantMessageId,
      sessionId: input.sessionId,
      role: "assistant",
      content: "",
      status: "streaming",
      errorMessage: null,
      inputMode: null,
      responseStyle: null,
      transcriptPolished: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    session.threadId = input.threadId;
    session.activeTurnId = input.turnId;
    session.status = "running";
    session.stopRequested = false;
    session.stopClaimedAt = null;
    session.claimedMessageId = null;
    session.lastError = null;
    session.updatedAt = nowIso();
    session.lastActivityAt = session.updatedAt;
    state.messages.push(assistantMessage);

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: session.deviceId,
      sessionId: session.id,
      type: "run_started",
      detail: input.turnId
    });
    await this.writeState(state);
    this.emitMessage(principal.host.id, userMessage);
    this.emitMessage(principal.host.id, assistantMessage);
    this.emitSession(session);
    return toPublicSession(session);
  }

  async appendAssistantDelta(token: string, input: HostAssistantDeltaRequest): Promise<ChatMessage> {
    const principal = await this.requireHost(token);
    const state = await this.readState();
    const session = this.requireSessionForHostState(state, input.sessionId, principal.host.id);
    const assistantMessage = this.requireMessage(state, input.assistantMessageId, session.id);

    assistantMessage.content += input.delta;
    assistantMessage.updatedAt = nowIso();
    session.lastPreview = truncatePreview(assistantMessage.content);
    session.lastActivityAt = assistantMessage.updatedAt;

    await this.writeState(state);
    this.emitMessage(principal.host.id, assistantMessage);
    return assistantMessage;
  }

  async completeTurn(token: string, input: HostCompleteTurnRequest): Promise<ChatSession> {
    const principal = await this.requireHost(token);
    const state = await this.readState();
    const session = this.requireSessionForHostState(state, input.sessionId, principal.host.id);
    const assistantMessage = this.requireMessage(state, input.assistantMessageId, session.id);

    assistantMessage.status = "completed";
    assistantMessage.updatedAt = nowIso();
    assistantMessage.errorMessage = null;

    session.threadId = input.threadId;
    session.activeTurnId = null;
    session.status = "idle";
    session.stopRequested = false;
    session.stopClaimedAt = null;
    session.updatedAt = nowIso();
    session.lastPreview = truncatePreview(assistantMessage.content);
    session.lastActivityAt = session.updatedAt;

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: session.deviceId,
      sessionId: session.id,
      type: "run_completed",
      detail: input.turnId
    });
    await this.sendSessionNotification(state, principal.host.id, session.id, "run_complete", truncatePreview(assistantMessage.content));
    await this.writeState(state);
    this.emitMessage(principal.host.id, assistantMessage);
    this.emitSession(session);
    return toPublicSession(session);
  }

  async failTurn(token: string, input: HostFailTurnRequest): Promise<ChatSession> {
    const principal = await this.requireHost(token);
    const state = await this.readState();
    const session = this.requireSessionForHostState(state, input.sessionId, principal.host.id);
    const userMessage = this.requireMessage(state, input.userMessageId, session.id);
    let assistantMessage: ChatMessage | null = null;

    if (userMessage.status === "pending") {
      userMessage.status = "failed";
      userMessage.updatedAt = nowIso();
      userMessage.errorMessage = input.errorMessage;
    }

    if (input.assistantMessageId) {
      assistantMessage = this.requireMessage(state, input.assistantMessageId, session.id);
      assistantMessage.status = "failed";
      assistantMessage.updatedAt = nowIso();
      assistantMessage.errorMessage = input.errorMessage;
    } else {
      assistantMessage = {
        id: createId("msg"),
        sessionId: session.id,
        role: "assistant",
        content: "",
        status: "failed",
        errorMessage: input.errorMessage,
        inputMode: null,
        responseStyle: null,
        transcriptPolished: null,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      state.messages.push(assistantMessage);
    }

    session.threadId = input.threadId ?? session.threadId;
    session.activeTurnId = null;
    session.status = "error";
    session.stopRequested = false;
    session.claimedMessageId = null;
    session.stopClaimedAt = null;
    session.lastError = input.errorMessage;
    session.updatedAt = nowIso();
    session.lastPreview = truncatePreview(input.errorMessage);
    session.lastActivityAt = session.updatedAt;

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: session.deviceId,
      sessionId: session.id,
      type: "run_failed",
      detail: input.errorMessage
    });
    await this.sendSessionNotification(state, principal.host.id, session.id, "run_failed", input.errorMessage);
    await this.writeState(state);
    this.emitMessage(principal.host.id, userMessage);
    this.emitMessage(principal.host.id, assistantMessage);
    this.emitSession(session);
    return toPublicSession(session);
  }

  async interruptTurn(token: string, input: HostInterruptTurnRequest): Promise<ChatSession> {
    const principal = await this.requireHost(token);
    const state = await this.readState();
    const session = this.requireSessionForHostState(state, input.sessionId, principal.host.id);

    const assistantMessageId =
      input.assistantMessageId ??
      [...state.messages]
        .reverse()
        .find((message) => message.sessionId === session.id && message.role === "assistant" && message.status === "streaming")?.id;

    if (assistantMessageId) {
      const assistantMessage = this.requireMessage(state, assistantMessageId, session.id);
      assistantMessage.status = "interrupted";
      assistantMessage.updatedAt = nowIso();
      assistantMessage.errorMessage = "Run stopped from the mobile app.";
      this.emitMessage(principal.host.id, assistantMessage);
    }

    session.activeTurnId = null;
    session.status = "idle";
    session.stopRequested = false;
    session.stopClaimedAt = null;
    session.updatedAt = nowIso();
    session.lastActivityAt = session.updatedAt;

    this.addAuditEvent(state, {
      hostId: principal.host.id,
      deviceId: session.deviceId,
      sessionId: session.id,
      type: "run_interrupted",
      detail: input.turnId
    });
    await this.writeState(state);
    this.emitSession(session);
    return toPublicSession(session);
  }

  async getOverview(): Promise<GatewayOverview> {
    const state = await this.readState();
    const host = [...state.hosts].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))[0] ?? null;
    if (!host) {
      return {
        hostStatus: null,
        lastSeenDevice: null,
        recentDevices: [],
        recentSessions: [],
        recentSessionActivity: [],
        auditEvents: []
      };
    }

    const recentDevices = [...state.devices]
      .filter((item) => item.hostId === host.id && !item.revokedAt)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, 8);

    const recentSessionRecords = [...state.sessions]
      .filter((item) => item.hostId === host.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, 6);

    const recentSessionActivity = recentSessionRecords.map((session): RecentSessionActivity => {
      const sessionMessages = state.messages
        .filter((item) => item.sessionId === session.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

      return {
        session: toPublicSession(session),
        latestUserMessage: sessionMessages.find((item) => item.role === "user") ?? null,
        latestAssistantMessage: sessionMessages.find((item) => item.role === "assistant") ?? null,
        lastMessageAt: sessionMessages[0]?.updatedAt ?? null
      };
    });

    const recentSessions = recentSessionActivity.map((item) => item.session);

    return {
      hostStatus: await this.buildHostStatus(host.id),
      lastSeenDevice: recentDevices[0] ? toPublicDevice(recentDevices[0]) : null,
      recentDevices: recentDevices.map(toPublicDevice),
      recentSessions,
      recentSessionActivity,
      auditEvents: state.auditEvents
        .filter((item) => item.hostId === host.id)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .slice(0, 12)
    };
  }

  private async requirePrincipal(token: string): Promise<Principal> {
    const state = await this.readState();
    const host = state.hosts.find((item) => item.hostToken === token);
    if (host) {
      return { kind: "host", host };
    }

    const device = state.devices.find((item) => item.deviceToken === token);
    if (!device) {
      throw new Error("Invalid session token.");
    }
    if (device.revokedAt) {
      throw new Error("Invalid session token.");
    }
    const pairedHost = state.hosts.find((item) => item.id === device.hostId);
    if (!pairedHost) {
      throw new Error("Paired host not found.");
    }
    return { kind: "device", host: pairedHost, device };
  }

  private async requireHost(token: string): Promise<{ kind: "host"; host: HostRecord }> {
    const principal = await this.requirePrincipal(token);
    if (principal.kind !== "host") {
      throw new Error("Host token required.");
    }
    return principal;
  }

  private async requireDevice(token: string): Promise<{ kind: "device"; host: HostRecord; device: DeviceRecord }> {
    const principal = await this.requirePrincipal(token);
    if (principal.kind !== "device") {
      throw new Error("Paired device token required.");
    }
    return principal;
  }

  private async requireSessionForDevice(sessionId: string, deviceId: string): Promise<SessionRecord> {
    const state = await this.readState();
    const session = state.sessions.find((item) => item.id === sessionId && item.deviceId === deviceId);
    if (!session) {
      throw new Error("Session not found.");
    }
    return session;
  }

  private requireSessionForHostState(state: GatewayState, sessionId: string, hostId: string): SessionRecord {
    const session = state.sessions.find((item) => item.id === sessionId && item.hostId === hostId);
    if (!session) {
      throw new Error("Session not found.");
    }
    return session;
  }

  private requireMessage(state: GatewayState, messageId: string, sessionId: string): ChatMessage {
    const message = state.messages.find((item) => item.id === messageId && item.sessionId === sessionId);
    if (!message) {
      throw new Error("Message not found.");
    }
    return message;
  }

  private async buildHostStatus(hostId: string): Promise<HostStatus> {
    const state = await this.readState();
    const host = state.hosts.find((item) => item.id === hostId);
    if (!host) {
      throw new Error("Host not found.");
    }

    const online = isRecent(host.lastSeenAt, 15_000);
    host.isOnline = online;

    return {
      host: toPublicHost(host),
      auth: host.auth,
      tailscale: host.tailscale,
      availability: deriveHostAvailability(host),
      repairState: deriveRepairState(host),
      runState: deriveRunState(state.sessions, hostId),
      activeSessionCount: state.sessions.filter((item) => item.hostId === hostId && item.activeTurnId).length,
      pairedDeviceCount: state.devices.filter((item) => item.hostId === hostId && !item.revokedAt).length
    };
  }

  private emitHostStatus(host: HostRecord): void {
    void this.buildHostStatus(host.id).then((hostStatus) => {
      this.events.emit("broadcast", {
        hostId: host.id,
        event: {
          type: "host_status",
          hostStatus
        }
      } satisfies BroadcastEnvelope);
    });
  }

  private emitSession(session: SessionRecord): void {
    this.events.emit("broadcast", {
      hostId: session.hostId,
      event: {
        type: "session_upsert",
        session: toPublicSession(session)
      }
    } satisfies BroadcastEnvelope);
  }

  private emitMessage(hostId: string, message: ChatMessage): void {
    this.events.emit("broadcast", {
      hostId,
      event: {
        type: "message_upsert",
        sessionId: message.sessionId,
        message
      }
    } satisfies BroadcastEnvelope);
  }

  private async touchDevice(device: DeviceRecord): Promise<void> {
    device.lastSeenAt = nowIso();
    await this.writeState(await this.readState());
  }

  private addAuditEvent(
    state: GatewayState,
    input: { hostId: string; deviceId: string | null; sessionId: string | null; type: string; detail: string | null }
  ): void {
    state.auditEvents.unshift({
      id: createId("audit"),
      hostId: input.hostId,
      deviceId: input.deviceId,
      sessionId: input.sessionId,
      type: input.type,
      detail: input.detail,
      createdAt: nowIso()
    });
    state.auditEvents = state.auditEvents.slice(0, 250);
  }

  private async sendSessionNotification(
    state: GatewayState,
    hostId: string,
    sessionId: string,
    event: NotificationEvent,
    detail: string
  ): Promise<void> {
    const session = state.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }
    const device = state.devices.find((item) => item.id === session.deviceId && !item.revokedAt);
    if (!device) {
      return;
    }
    await this.sendNotification(state, hostId, device, event, detail, sessionId);
  }

  private async sendNotification(
    state: GatewayState,
    hostId: string,
    device: DeviceRecord,
    event: NotificationEvent,
    detail: string,
    sessionId: string | null = null
  ): Promise<void> {
    if (!device.pushToken || !device.notificationPrefs[event]) {
      return;
    }
    const serverKey = process.env.FCM_SERVER_KEY?.trim();
    if (!serverKey) {
      this.addAuditEvent(state, {
        hostId,
        deviceId: device.id,
        sessionId,
        type: "notification_skipped",
        detail: `${event}:missing_fcm_server_key`
      });
      return;
    }

    const payload = {
      to: device.pushToken,
      priority: "high",
      notification: {
        title: notificationTitleForEvent(event),
        body: detail
      },
      data: {
        event,
        hostId,
        sessionId: sessionId ?? "",
        detail
      }
    };

    try {
      const response = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          authorization: `key=${serverKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`FCM responded with ${response.status}`);
      }
      device.lastNotificationAt = nowIso();
      this.addAuditEvent(state, {
        hostId,
        deviceId: device.id,
        sessionId,
        type: "notification_sent",
        detail: event
      });
    } catch (error) {
      this.addAuditEvent(state, {
        hostId,
        deviceId: device.id,
        sessionId,
        type: "notification_failed",
        detail: error instanceof Error ? `${event}:${error.message}` : `${event}:unknown_error`
      });
    }
  }

  private async readState(): Promise<GatewayState> {
    if (this.state) {
      return this.state;
    }

    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.dataFile, "utf8");
      this.state = migrateState(JSON.parse(raw) as Partial<GatewayState>);
    } catch {
      this.state = defaultState();
      await this.writeState(this.state);
    }
    return this.state;
  }

  private async writeState(state: GatewayState): Promise<void> {
    this.state = state;
    await mkdir(this.dataDir, { recursive: true });
    await writeFile(this.dataFile, JSON.stringify(state, null, 2), "utf8");
  }

  private recoverSiblingSessions(state: GatewayState, host: HostRecord, device: DeviceRecord): void {
    const siblingHosts = state.hosts.filter(
      (item) =>
        item.id !== host.id &&
        !item.isOnline &&
        hostsLookEquivalent(item, host)
    );

    if (!siblingHosts.length) {
      return;
    }

    const siblingHostIds = new Set(siblingHosts.map((item) => item.id));
    const siblingDevices = state.devices.filter(
      (item) => siblingHostIds.has(item.hostId) && item.deviceName === device.deviceName
    );

    if (!siblingDevices.length) {
      return;
    }

    const siblingDeviceIds = new Set(siblingDevices.map((item) => item.id));
    const recoveredAt = nowIso();

    for (const session of state.sessions) {
      if (!siblingDeviceIds.has(session.deviceId)) {
        continue;
      }
      session.hostId = host.id;
      session.deviceId = device.id;
      session.updatedAt = recoveredAt;
    }
  }
}

function toPublicHost(host: HostRecord): RegisteredHost {
  return {
    id: host.id,
    hostName: host.hostName,
    approvedRoots: host.approvedRoots,
    pairingCode: host.pairingCode,
    pairingCodeIssuedAt: host.pairingCodeIssuedAt,
    createdAt: host.createdAt,
    lastSeenAt: host.lastSeenAt,
    isOnline: isRecent(host.lastSeenAt, 15_000)
  };
}

function toPublicDevice(device: DeviceRecord): PairedDevice {
  return {
    id: device.id,
    hostId: device.hostId,
    deviceName: device.deviceName,
    pushToken: device.pushToken,
    notificationPrefs: device.notificationPrefs,
    revokedAt: device.revokedAt,
    lastNotificationAt: device.lastNotificationAt,
    repairCount: device.repairCount,
    repairedAt: device.repairedAt,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt
  };
}

function toPublicSession(session: SessionRecord): ChatSession {
  return {
    id: session.id,
    hostId: session.hostId,
    deviceId: session.deviceId,
    title: session.title,
    kind: session.kind,
    pinned: session.pinned,
    archived: session.archived,
    rootPath: session.rootPath,
    threadId: session.threadId,
    status: session.status,
    activeTurnId: session.activeTurnId,
    stopRequested: session.stopRequested,
    lastError: session.lastError,
    lastPreview: session.lastPreview,
    lastActivityAt: session.lastActivityAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

function isRecent(iso: string, thresholdMs: number): boolean {
  return Date.now() - new Date(iso).getTime() < thresholdMs;
}

function hostsLookEquivalent(left: HostRecord, right: HostRecord): boolean {
  const sameDnsName =
    left.tailscale.dnsName &&
    right.tailscale.dnsName &&
    left.tailscale.dnsName === right.tailscale.dnsName;

  if (sameDnsName) {
    return true;
  }

  return sameRoots(left.approvedRoots, right.approvedRoots);
}

function sameRoots(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  const leftSorted = [...left].sort();
  const rightSorted = [...right].sort();
  return leftSorted.every((value, index) => value === rightSorted[index]);
}

function truncatePreview(value: string, maxLength = 140): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function notificationTitleForEvent(event: NotificationEvent): string {
  switch (event) {
    case "approval_needed":
      return "Adam Connect approval needed";
    case "repair_needed":
      return "Adam Connect repair needed";
    case "run_failed":
      return "Adam Connect run failed";
    default:
      return "Adam Connect run complete";
  }
}

function deriveHostAvailability(host: HostRecord): HostAvailability {
  if (!isRecent(host.lastSeenAt, 15_000)) {
    return "offline";
  }
  if (host.auth.status !== "logged_in") {
    return "codex_unavailable";
  }
  if (!host.tailscale.connected) {
    return "tailscale_unavailable";
  }
  if (host.tailscale.transportSecurity === "insecure") {
    return "needs_attention";
  }
  return "ready";
}

function deriveRepairState(host: HostRecord): RepairState {
  return isRecent(host.lastSeenAt, 15_000) ? "healthy" : "reconnecting";
}

function deriveRunState(sessions: SessionRecord[], hostId: string): RunState {
  if (sessions.some((item) => item.hostId === hostId && item.status === "stopping")) {
    return "stopping";
  }
  if (sessions.some((item) => item.hostId === hostId && item.status === "running")) {
    return "running";
  }
  if (sessions.some((item) => item.hostId === hostId && item.status === "queued")) {
    return "sending";
  }
  if (sessions.some((item) => item.hostId === hostId && item.status === "error")) {
    return "failed";
  }
  return "ready";
}

function isInterruptClaimStale(value: string): boolean {
  return Date.now() - new Date(value).getTime() >= INTERRUPT_RECLAIM_MS;
}

function migrateState(input: Partial<GatewayState>): GatewayState {
  const state = defaultState();
  const now = nowIso();
  return {
    hosts: (input.hosts ?? []).map((host) => {
      const record = host as Partial<HostRecord>;
      return {
        ...record,
        auth: record.auth ?? defaultAuthState,
        tailscale: {
          ...defaultTailscaleStatus,
          ...(record.tailscale ?? {})
        }
      } as HostRecord;
    }),
    devices: (input.devices ?? []).map((device) => {
      const record = device as Partial<DeviceRecord>;
      return {
        ...record,
        pushToken: record.pushToken ?? null,
        notificationPrefs: record.notificationPrefs ?? defaultNotificationPrefs,
        revokedAt: record.revokedAt ?? null,
        lastNotificationAt: record.lastNotificationAt ?? null,
        repairCount: record.repairCount ?? 0,
        repairedAt: record.repairedAt ?? null
      } as DeviceRecord;
    }),
    sessions: (input.sessions ?? []).map((session) => {
      const record = session as Partial<SessionRecord>;
      const isOperator = record.title?.trim().toLowerCase() === "operator";
      return {
        ...record,
        kind: record.kind ?? (isOperator ? "operator" : "project"),
        pinned: record.pinned ?? isOperator,
        archived: record.archived ?? false,
        lastPreview: record.lastPreview ?? null,
        lastActivityAt: record.lastActivityAt ?? record.updatedAt ?? now,
        claimedMessageId: record.claimedMessageId ?? null,
        stopClaimedAt: record.stopClaimedAt ?? null
      } as SessionRecord;
    }),
    messages: (input.messages ?? []).map((message) => {
      const record = message as Partial<ChatMessage>;
      return {
        ...record,
        inputMode: record.inputMode ?? null,
        responseStyle: record.responseStyle ?? null,
        transcriptPolished: record.transcriptPolished ?? null
      } as ChatMessage;
    }),
    auditEvents: input.auditEvents ?? []
  };
}
