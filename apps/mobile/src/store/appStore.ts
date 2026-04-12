import { create } from "zustand";
import type { ChatMessage, ChatSession, HostStatus, StreamEvent } from "@adam-connect/shared";
import { ApiClient } from "../services/api/client";
import { clearSettings, loadSettings, saveSettings } from "../services/storage/settingsStorage";
import { clearDeviceToken, loadDeviceToken, saveDeviceToken } from "../services/storage/tokenStorage";
import { TtsService } from "../services/voice/ttsService";
import { VoiceService } from "../services/voice/voiceService";
import { normalizeBaseUrl, websocketUrlFromBase } from "../config";

type View = "host" | "sessions" | "chat";
type EditableField = "baseUrl" | "deviceName" | "pairingCode" | "composer" | "newSessionRootPath";

interface AppState {
  booting: boolean;
  view: View;
  baseUrl: string;
  deviceName: string;
  pairingCode: string;
  token: string | null;
  hostStatus: HostStatus | null;
  sessions: ChatSession[];
  selectedSessionId: string | null;
  messagesBySession: Record<string, ChatMessage[]>;
  composer: string;
  newSessionRootPath: string;
  autoSpeak: boolean;
  voiceAvailable: boolean;
  listening: boolean;
  lastSpokenMessageId: string | null;
  error: string | null;
  bootstrap(): Promise<void>;
  connectPairing(): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  selectSession(sessionId: string): Promise<void>;
  createSession(): Promise<void>;
  sendMessage(): Promise<void>;
  stopSession(): Promise<void>;
  toggleAutoSpeak(): Promise<void>;
  toggleListening(): Promise<void>;
  setField<K extends EditableField>(field: K, value: AppState[K]): void;
  setView(view: View): void;
}

const api = new ApiClient();
const voice = new VoiceService();
const tts = new TtsService();
let socket: WebSocket | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  booting: true,
  view: "host",
  baseUrl: "",
  deviceName: "Adam's Phone",
  pairingCode: "",
  token: null,
  hostStatus: null,
  sessions: [],
  selectedSessionId: null,
  messagesBySession: {},
  composer: "",
  newSessionRootPath: "",
  autoSpeak: false,
  voiceAvailable: false,
  listening: false,
  lastSpokenMessageId: null,
  error: null,
  async bootstrap() {
    const [settings, token, voiceAvailable] = await Promise.all([
      loadSettings(),
      loadDeviceToken(),
      voice.isAvailable()
    ]);

    set({
      baseUrl: settings?.baseUrl ?? "",
      deviceName: settings?.deviceName ?? "Adam's Phone",
      autoSpeak: settings?.autoSpeak ?? false,
      token,
      voiceAvailable,
      booting: false
    });

    if (settings?.baseUrl && token) {
      await get().refresh();
      connectSocket(settings.baseUrl, token, set, get);
    }
  },
  async connectPairing() {
    const baseUrl = normalizeBaseUrl(get().baseUrl);
    set({ error: null });
    const paired = await api.completePairing(baseUrl, get().pairingCode.trim().toUpperCase(), get().deviceName.trim());
    await saveSettings({
      baseUrl,
      deviceName: get().deviceName.trim(),
      autoSpeak: get().autoSpeak
    });
    await saveDeviceToken(paired.deviceToken);
    set({
      token: paired.deviceToken,
      baseUrl,
      hostStatus: {
        host: paired.host,
        auth: { status: "logged_out", detail: "Waiting for desktop heartbeat." },
        tailscale: {
          installed: false,
          connected: false,
          detail: "Waiting for desktop Tailscale status.",
          dnsName: null,
          ipv4: null,
          suggestedUrl: null,
          installUrl: "https://tailscale.com/download",
          loginUrl: "https://login.tailscale.com/start"
        },
        activeSessionCount: 0,
        pairedDeviceCount: 1
      },
      pairingCode: "",
      newSessionRootPath: paired.host.approvedRoots[0] ?? "",
      view: "host"
    });
    connectSocket(baseUrl, paired.deviceToken, set, get);
    await get().refresh();
  },
  async disconnect() {
    socket?.close();
    socket = null;
    tts.stop();
    await Promise.all([clearSettings(), clearDeviceToken()]);
    set({
      baseUrl: "",
      pairingCode: "",
      token: null,
      hostStatus: null,
      sessions: [],
      selectedSessionId: null,
      messagesBySession: {},
      composer: "",
      newSessionRootPath: "",
      lastSpokenMessageId: null,
      error: null,
      view: "host"
    });
  },
  async refresh() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    const [hostStatus, sessions] = await Promise.all([
      api.getHostStatus(token, baseUrl),
      api.listSessions(token, baseUrl)
    ]);

    set({
      hostStatus,
      sessions,
      newSessionRootPath: get().newSessionRootPath || hostStatus.host.approvedRoots[0] || "",
      error: null
    });

    const selected = get().selectedSessionId;
    if (selected) {
      await get().selectSession(selected);
    }
  },
  async selectSession(sessionId: string) {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    const messages = await api.listMessages(token, baseUrl, sessionId);
    set((state) => ({
      selectedSessionId: sessionId,
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: messages
      },
      view: "chat",
      error: null
    }));
  },
  async createSession() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    const rootPath = get().newSessionRootPath || get().hostStatus?.host.approvedRoots[0];
    const session = await api.createSession(token, baseUrl, {
      rootPath
    });
    set((state) => ({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      selectedSessionId: session.id,
      view: "chat",
      error: null
    }));
    await get().selectSession(session.id);
  },
  async sendMessage() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    const sessionId = requireValue(get().selectedSessionId, "Open a chat before sending a message.");
    const text = get().composer.trim();
    if (!text) {
      return;
    }

    const message = await api.postMessage(token, baseUrl, sessionId, { text });
    set((state) => ({
      composer: "",
      messagesBySession: {
        ...state.messagesBySession,
        [sessionId]: [...(state.messagesBySession[sessionId] ?? []), message]
      },
      error: null
    }));
    await get().refresh();
  },
  async stopSession() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    const sessionId = requireValue(get().selectedSessionId, "Open a chat before stopping a run.");
    await api.stopSession(token, baseUrl, sessionId);
    await get().refresh();
  },
  async toggleAutoSpeak() {
    const next = !get().autoSpeak;
    await saveSettings({
      baseUrl: get().baseUrl,
      deviceName: get().deviceName,
      autoSpeak: next
    });
    set({ autoSpeak: next });
  },
  async toggleListening() {
    if (get().listening) {
      await voice.stopListening();
      set({ listening: false });
      return;
    }

    await voice.startListening((text) => {
      set({ composer: text, listening: false });
    });
    set({ listening: true });
  },
  setField(field, value) {
    set({ [field]: value } as Pick<AppState, typeof field>);
  },
  setView(view) {
    set({ view });
  }
}));

function connectSocket(
  baseUrl: string,
  token: string,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState
): void {
  socket?.close();
  socket = new WebSocket(`${websocketUrlFromBase(baseUrl)}?token=${encodeURIComponent(token)}`);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(String(event.data)) as StreamEvent | { type: "hello" };
      if (payload.type === "hello") {
        return;
      }
      applyStreamEvent(payload, set, get);
    } catch {
      set({ error: "Received an invalid realtime payload from the desktop gateway." });
    }
  };

  socket.onerror = () => {
    set({ error: "Realtime connection dropped. Pull to refresh or reopen the app." });
  };
}

function applyStreamEvent(
  payload: StreamEvent,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState
): void {
  if (payload.type === "host_status") {
    set({
      hostStatus: payload.hostStatus,
      newSessionRootPath: get().newSessionRootPath || payload.hostStatus.host.approvedRoots[0] || ""
    });
    return;
  }

  if (payload.type === "session_upsert") {
    set((state) => ({
      sessions: [payload.session, ...state.sessions.filter((item) => item.id !== payload.session.id)]
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    }));
    return;
  }

  set((state) => {
    const currentMessages = state.messagesBySession[payload.sessionId] ?? [];
    const nextMessages = [...currentMessages.filter((item) => item.id !== payload.message.id), payload.message].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );

    if (
      payload.message.role === "assistant" &&
      payload.message.status === "completed" &&
      state.autoSpeak &&
      state.lastSpokenMessageId !== payload.message.id &&
      tts.isAvailable()
    ) {
      tts.speak(payload.message.content);
      return {
        messagesBySession: {
          ...state.messagesBySession,
          [payload.sessionId]: nextMessages
        },
        lastSpokenMessageId: payload.message.id
      };
    }

    return {
      messagesBySession: {
        ...state.messagesBySession,
        [payload.sessionId]: nextMessages
      }
    };
  });
}

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined || value === "") {
    throw new Error(message);
  }
  return value;
}
