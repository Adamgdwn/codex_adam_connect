import { EventEmitter } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createId, generatePairingCode, nowIso } from "@adam-connect/core";
import type {
  ChatMessage,
  ChatSession,
  CreateSessionRequest,
  GatewayOverview,
  HostAssistantDeltaRequest,
  HostAuthState,
  HostCompleteTurnRequest,
  HostFailTurnRequest,
  HostHeartbeatRequest,
  HostInterruptTurnRequest,
  HostStartTurnRequest,
  HostStatus,
  HostWorkItem,
  PairingCompleteResponse,
  PairedDevice,
  PostMessageRequest,
  RecentSessionActivity,
  RegisterHostRequest,
  RegisterHostResponse,
  RegisteredHost,
  StreamEvent,
  TailscaleStatus,
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
}

type Principal =
  | { kind: "host"; host: HostRecord }
  | { kind: "device"; host: HostRecord; device: DeviceRecord };

interface BroadcastEnvelope {
  hostId: string;
  event: StreamEvent;
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
  installUrl: "https://tailscale.com/download",
  loginUrl: "https://login.tailscale.com/start"
};

const defaultState = (): GatewayState => ({
  hosts: [],
  devices: [],
  sessions: [],
  messages: []
});

export class GatewayStore {
  private readonly dataFile: string;
  private readonly events = new EventEmitter();
  private state: GatewayState | null = null;

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
        createdAt: now,
        lastSeenAt: now,
        deviceToken: createId("devicetoken")
      };
      state.devices.push(device);
      this.recoverSiblingSessions(state, host, device);
    } else {
      device.lastSeenAt = now;
      device.deviceToken = createId("devicetoken");
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

  async listSessions(token: string): Promise<ChatSession[]> {
    const principal = await this.requireDevice(token);
    await this.touchDevice(principal.device);
    return (await this.readState()).sessions
      .filter((item) => item.deviceId === principal.device.id)
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
      rootPath,
      threadId: null,
      status: "idle",
      activeTurnId: null,
      stopRequested: false,
      lastError: null,
      createdAt: now,
      updatedAt: now,
      claimedMessageId: null,
      stopClaimedAt: null
    };

    state.sessions.push(session);
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

    await this.writeState(state);
    this.emitSession(targetSession);
    return toPublicSession(targetSession);
  }

  async getNextWork(token: string): Promise<HostWorkItem | null> {
    const principal = await this.requireHost(token);
    const state = await this.readState();

    const interruptSession = state.sessions.find(
      (item) => item.hostId === principal.host.id && item.activeTurnId && item.stopRequested && !item.stopClaimedAt
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
    state.messages.push(assistantMessage);

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

    if (input.assistantMessageId) {
      const assistantMessage = this.requireMessage(state, input.assistantMessageId, session.id);
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
        recentSessionActivity: []
      };
    }

    const recentDevices = [...state.devices]
      .filter((item) => item.hostId === host.id)
      .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
      .slice(0, 4);

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
      recentSessionActivity
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
      activeSessionCount: state.sessions.filter((item) => item.hostId === hostId && item.activeTurnId).length,
      pairedDeviceCount: state.devices.filter((item) => item.hostId === hostId).length
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

  private async readState(): Promise<GatewayState> {
    if (this.state) {
      return this.state;
    }

    await mkdir(this.dataDir, { recursive: true });
    try {
      const raw = await readFile(this.dataFile, "utf8");
      this.state = JSON.parse(raw) as GatewayState;
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
    rootPath: session.rootPath,
    threadId: session.threadId,
    status: session.status,
    activeTurnId: session.activeTurnId,
    stopRequested: session.stopRequested,
    lastError: session.lastError,
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
