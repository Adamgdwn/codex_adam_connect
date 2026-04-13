import { create } from "zustand";
import { buildProjectStarterPrompt } from "@adam-connect/shared";
import type { ChatMessage, ChatSession, HostStatus, InputMode, NotificationEvent, PairedDevice, ResponseStyle, StreamEvent } from "@adam-connect/shared";
import type { ProjectTemplateId } from "@adam-connect/shared";
import { ApiClient } from "../services/api/client";
import { clearSettings, loadSettings, saveSettings } from "../services/storage/settingsStorage";
import { clearDeviceToken, loadDeviceToken, saveDeviceToken } from "../services/storage/tokenStorage";
import { FcmService } from "../services/notifications/fcmService";
import { TtsService } from "../services/voice/ttsService";
import { VoiceService } from "../services/voice/voiceService";
import { normalizeBaseUrl, websocketUrlFromBase } from "../config";
import { DEFAULT_BASE_URL } from "../generated/runtimeConfig";
import {
  findOperatorSession,
  findStopTargetSession,
  isPairingRepairErrorMessage,
  isSessionBusy,
  isQueuedVoiceAutoSendPending,
  OPERATOR_SESSION_TITLE,
  pairingRepairMessage,
  findSendTargetSession,
  pickPreferredSessionId,
  requiresVoiceReview,
  sortSessionsForDisplay
} from "../utils/operatorConsole";

type View = "host" | "sessions" | "chat";
type EditableField =
  | "baseUrl"
  | "deviceName"
  | "pairingCode"
  | "composer"
  | "newSessionRootPath"
  | "newSessionTitle"
  | "responseStyle"
  | "projectIntent"
  | "projectInstructions"
  | "projectOutputType"
  | "projectTemplateId";

export interface AppState {
  booting: boolean;
  refreshing: boolean;
  sendingMessage: boolean;
  realtimeConnected: boolean;
  view: View;
  baseUrl: string;
  deviceName: string;
  pairingCode: string;
  token: string | null;
  currentDeviceId: string | null;
  hostStatus: HostStatus | null;
  devices: PairedDevice[];
  sessions: ChatSession[];
  selectedSessionId: string | null;
  messagesBySession: Record<string, ChatMessage[]>;
  composer: string;
  composerInputMode: InputMode;
  newSessionRootPath: string;
  newSessionTitle: string;
  projectIntent: string;
  projectInstructions: string;
  projectOutputType: string;
  projectTemplateId: ProjectTemplateId;
  responseStyle: ResponseStyle;
  renameDraftBySession: Record<string, string>;
  autoSpeak: boolean;
  autoSendVoice: boolean;
  voiceAvailable: boolean;
  pushAvailable: boolean;
  pushSyncing: boolean;
  listening: boolean;
  lastSpokenMessageId: string | null;
  notice: string | null;
  error: string | null;
  bootstrap(): Promise<void>;
  connectPairing(): Promise<void>;
  disconnect(): Promise<void>;
  refresh(): Promise<void>;
  reconnectRealtime(): Promise<void>;
  selectSession(sessionId: string): Promise<void>;
  createProjectSession(): Promise<void>;
  renameSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  sendMessage(): Promise<void>;
  stopSession(): Promise<void>;
  renameCurrentDevice(): Promise<void>;
  enablePushNotifications(): Promise<void>;
  toggleNotificationPreference(event: NotificationEvent): Promise<void>;
  sendDeviceTestNotification(deviceId: string, event: NotificationEvent): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
  toggleAutoSpeak(): Promise<void>;
  toggleAutoSendVoice(): Promise<void>;
  toggleListening(): Promise<void>;
  setResponseStyle(style: ResponseStyle): Promise<void>;
  setRenameDraft(sessionId: string, value: string): void;
  setField<K extends EditableField>(field: K, value: AppState[K]): void;
  setView(view: View): void;
}

const api = new ApiClient();
const voice = new VoiceService();
const fcm = new FcmService();
const tts = new TtsService();
let socket: WebSocket | null = null;
let unsubscribePushTokenRefresh: (() => void) | null = null;

export const useAppStore = create<AppState>((set, get) => ({
  booting: true,
  refreshing: false,
  sendingMessage: false,
  realtimeConnected: false,
  view: "host",
  baseUrl: DEFAULT_BASE_URL,
  deviceName: "Adam's Phone",
  pairingCode: "",
  token: null,
  currentDeviceId: null,
  hostStatus: null,
  devices: [],
  sessions: [],
  selectedSessionId: null,
  messagesBySession: {},
  composer: "",
  composerInputMode: "text",
  newSessionRootPath: "",
  newSessionTitle: "",
  projectIntent: "",
  projectInstructions: "",
  projectOutputType: "implementation plan",
  projectTemplateId: "greenfield",
  responseStyle: "natural",
  renameDraftBySession: {},
  autoSpeak: false,
  autoSendVoice: true,
  voiceAvailable: false,
  pushAvailable: false,
  pushSyncing: false,
  listening: false,
  lastSpokenMessageId: null,
  notice: null,
  error: null,
  async bootstrap() {
    const [settings, token, voiceAvailable] = await Promise.all([
      loadSettings(),
      loadDeviceToken(),
      voice.isAvailable()
    ]);

    set({
      baseUrl: settings?.baseUrl ?? DEFAULT_BASE_URL,
      deviceName: settings?.deviceName ?? "Adam's Phone",
      currentDeviceId: settings?.currentDeviceId ?? null,
      autoSpeak: settings?.autoSpeak ?? false,
      autoSendVoice: settings?.autoSendVoice ?? true,
      responseStyle: settings?.responseStyle ?? "natural",
      token,
      voiceAvailable,
      pushAvailable: fcm.isAvailable(),
      realtimeConnected: false,
      notice: token ? "Restoring the saved desktop link." : null,
      booting: false
    });

    if (settings?.baseUrl && token) {
      await get().refresh();
      syncPushTokenRefresh(settings.baseUrl, token, get, set);
      connectSocket(settings.baseUrl, token, set, get);
    }
  },
  async connectPairing() {
    const baseUrl = normalizeBaseUrl(get().baseUrl);
    set({ error: null });
    try {
      const paired = await api.completePairing(baseUrl, get().pairingCode.trim().toUpperCase(), get().deviceName.trim());
      await saveSettings({
        baseUrl,
        deviceName: get().deviceName.trim(),
        currentDeviceId: paired.device.id,
        autoSpeak: get().autoSpeak,
        autoSendVoice: get().autoSendVoice,
        responseStyle: get().responseStyle
      });
      await saveDeviceToken(paired.deviceToken);
      set({
        token: paired.deviceToken,
        baseUrl,
        currentDeviceId: paired.device.id,
        devices: [paired.device],
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
            transportSecurity: "insecure",
            installUrl: "https://tailscale.com/download",
            loginUrl: "https://login.tailscale.com/start"
          },
          availability: "reconnecting",
          repairState: "reconnecting",
          runState: "ready",
          activeSessionCount: 0,
          pairedDeviceCount: 1
        },
        pairingCode: "",
        newSessionRootPath: paired.host.approvedRoots[0] ?? "",
        realtimeConnected: false,
        notice: "Phone paired. The Operator chat will be ready for quick turns.",
        view: "host"
      });
      syncPushTokenRefresh(baseUrl, paired.deviceToken, get, set);
      connectSocket(baseUrl, paired.deviceToken, set, get);
      await get().refresh();
      await ensureOperatorSession(get, set);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : "Pairing failed. Check the desktop URL and pairing code, then try again."
      });
      throw error;
    }
  },
  async disconnect() {
    disconnectSocket();
    tts.stop();
    unsubscribePushTokenRefresh?.();
    unsubscribePushTokenRefresh = null;
    await Promise.all([clearSettings(), clearDeviceToken()]);
    set({
      baseUrl: DEFAULT_BASE_URL,
      pairingCode: "",
      token: null,
      currentDeviceId: null,
      hostStatus: null,
      devices: [],
      sessions: [],
      selectedSessionId: null,
      messagesBySession: {},
      composer: "",
      composerInputMode: "text",
      newSessionRootPath: "",
      newSessionTitle: "",
      projectIntent: "",
      projectInstructions: "",
      projectOutputType: "implementation plan",
      projectTemplateId: "greenfield",
      renameDraftBySession: {},
      autoSendVoice: true,
      lastSpokenMessageId: null,
      notice: null,
      refreshing: false,
      sendingMessage: false,
      realtimeConnected: false,
      error: null,
      view: "host"
    });
  },
  async refresh() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    set({ refreshing: true });
    try {
      const [hostStatus, sessions, devices] = await Promise.all([
        api.getHostStatus(token, baseUrl),
        api.listSessions(token, baseUrl),
        api.listDevices(token, baseUrl)
      ]);
      const currentSelected = get().selectedSessionId;
      const nextSelected = pickPreferredSessionId(currentSelected, sessions);
      const currentDeviceId =
        get().currentDeviceId && devices.some((device) => device.id === get().currentDeviceId)
          ? get().currentDeviceId
          : devices.find((device) => device.deviceName === get().deviceName)?.id ?? devices[0]?.id ?? null;

      if (currentDeviceId !== get().currentDeviceId) {
        await saveSettings({
          baseUrl,
          deviceName: get().deviceName,
          currentDeviceId,
          autoSpeak: get().autoSpeak,
          autoSendVoice: get().autoSendVoice,
          responseStyle: get().responseStyle
        });
      }

      set({
        hostStatus,
        devices,
        currentDeviceId,
        sessions: sortSessionsForDisplay(sessions),
        selectedSessionId: nextSelected,
        newSessionRootPath: get().newSessionRootPath || hostStatus.host.approvedRoots[0] || "",
        renameDraftBySession: sessions.reduce<Record<string, string>>((accumulator, session) => {
          accumulator[session.id] = get().renameDraftBySession[session.id] ?? session.title;
          return accumulator;
        }, {}),
        notice: null,
        error: null
      });

      if (nextSelected) {
        await get().selectSession(nextSelected);
      } else if (hostStatus.host.approvedRoots[0]) {
        const operatorSession = await ensureOperatorSession(get, set, {
          token,
          baseUrl,
          hostStatus
        });
        if (operatorSession) {
          await get().selectSession(operatorSession.id);
        }
      }

      if (!socket || socket.readyState === WebSocket.CLOSED || !get().realtimeConnected) {
        connectSocket(baseUrl, token, set, get);
      }

      maybeAutoSendVoiceResult(get, set).catch(() => undefined);
    } catch (error) {
      await handleStoreError(error, set, get, "Could not refresh this phone's desktop state.");
    } finally {
      set({ refreshing: false });
    }
  },
  async reconnectRealtime() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    set({ notice: "Reconnecting the realtime desktop link.", error: null, realtimeConnected: false });
    connectSocket(baseUrl, token, set, get);
    await get().refresh();
  },
  async selectSession(sessionId: string) {
    try {
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
        notice: null,
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not open that chat.");
    }
  },
  async createProjectSession() {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const rootPath = get().newSessionRootPath || get().hostStatus?.host.approvedRoots[0];
      const title = get().newSessionTitle.trim();
      const intent = get().projectIntent.trim();

      if (!intent) {
        set({ error: "Add a project goal so Codex knows how to kick this chat off." });
        return;
      }

      const starterPrompt = buildProjectStarterPrompt({
        projectName: title,
        rootPath,
        intent,
        starterInstructions: get().projectInstructions,
        desiredOutputType: get().projectOutputType,
        templateId: get().projectTemplateId,
        responseStyle: get().responseStyle
      });

      const session = await api.createSession(token, baseUrl, {
        rootPath,
        kind: "project",
        starterPrompt,
        ...(title ? { title } : {})
      });
      const kickoffMessage = await api.postMessage(token, baseUrl, session.id, {
        text: starterPrompt,
        inputMode: "text",
        responseStyle: get().responseStyle,
        transcriptPolished: true
      });

      set((state) => ({
        sessions: sortSessionsForDisplay([session, ...state.sessions.filter((item) => item.id !== session.id)]),
        selectedSessionId: session.id,
        newSessionTitle: "",
        projectIntent: "",
        projectInstructions: "",
        projectOutputType: "implementation plan",
        projectTemplateId: "greenfield",
        renameDraftBySession: {
          ...state.renameDraftBySession,
          [session.id]: session.title
        },
        messagesBySession: {
          ...state.messagesBySession,
          [session.id]: [...(state.messagesBySession[session.id] ?? []), kickoffMessage]
        },
        view: "chat",
        notice: "Project kickoff sent. Codex is starting with the new project brief.",
        error: null
      }));
      await get().refresh();
    } catch (error) {
      await handleStoreError(error, set, get, "Could not start the project kickoff.");
    }
  },
  async renameSession(sessionId: string) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const title = (get().renameDraftBySession[sessionId] ?? "").trim();
      if (!title) {
        set({ error: "Chat names cannot be empty." });
        return;
      }

      const session = await api.updateSession(token, baseUrl, sessionId, { title });
      set((state) => ({
        sessions: sortSessionsForDisplay([session, ...state.sessions.filter((item) => item.id !== session.id)]),
        renameDraftBySession: {
          ...state.renameDraftBySession,
          [session.id]: session.title
        },
        notice: null,
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not rename that chat.");
    }
  },
  async deleteSession(sessionId: string) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      await api.deleteSession(token, baseUrl, sessionId);

      set((state) => {
        const remainingSessions = sortSessionsForDisplay(state.sessions.filter((item) => item.id !== sessionId));
        const nextSelectedSessionId =
          state.selectedSessionId === sessionId
            ? pickPreferredSessionId(null, remainingSessions)
            : state.selectedSessionId;

        const nextMessagesBySession = { ...state.messagesBySession };
        delete nextMessagesBySession[sessionId];

        const nextRenameDrafts = { ...state.renameDraftBySession };
        delete nextRenameDrafts[sessionId];

        return {
          sessions: remainingSessions,
          selectedSessionId: nextSelectedSessionId,
          messagesBySession: nextMessagesBySession,
          renameDraftBySession: nextRenameDrafts,
          view: nextSelectedSessionId ? state.view : "sessions",
          notice: null,
          error: null
        };
      });

      const nextSelectedSessionId = get().selectedSessionId;
      if (nextSelectedSessionId) {
        await get().selectSession(nextSelectedSessionId);
      }
    } catch (error) {
      await handleStoreError(error, set, get, "Could not delete that chat.");
    }
  },
  async sendMessage() {
    if (get().sendingMessage) {
      return;
    }

    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const text = get().composer.trim();
      if (!text) {
        return;
      }

      let sessionId = get().selectedSessionId;
      if (!sessionId) {
        const operatorSession = await ensureOperatorSession(get, set, {
          token,
          baseUrl,
          hostStatus: get().hostStatus
        });
        sessionId = operatorSession?.id ?? pickPreferredSessionId(null, get().sessions);
        if (sessionId) {
          await get().selectSession(sessionId);
        }
      }
      const resolvedSessionId = requireValue(sessionId, "Open or start a chat before sending a message.");
      const targetSession = findSendTargetSession(resolvedSessionId, get().sessions);
      if (isSessionBusy(targetSession)) {
        set({
          notice:
            get().composerInputMode === "voice" && get().autoSendVoice
              ? "Voice captured. Codex is still busy, so your transcript will send automatically when this run finishes or you tap Stop."
              : "Codex is still busy with the current run. Your draft is staying in the composer until this run finishes or you tap Stop.",
          error: null,
          view: "chat"
        });
        return;
      }

      set({ sendingMessage: true, error: null });
      const message = await api.postMessage(token, baseUrl, resolvedSessionId, {
        text,
        inputMode: get().composerInputMode,
        responseStyle: get().responseStyle,
        transcriptPolished: get().composerInputMode === "voice_polished"
      });
      set((state) => ({
        composer: "",
        composerInputMode: "text",
        sendingMessage: false,
        notice: null,
        messagesBySession: {
          ...state.messagesBySession,
          [resolvedSessionId]: [...(state.messagesBySession[resolvedSessionId] ?? []), message]
        },
        error: null
      }));
      await get().refresh();
    } catch (error) {
      await handleStoreError(error, set, get, "Could not send that message.");
    } finally {
      set({ sendingMessage: false });
    }
  },
  async stopSession() {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const sessionId = requireValue(findStopTargetSession(get().selectedSessionId, get().sessions)?.id, "Open a busy chat before stopping a run.");
      await api.stopSession(token, baseUrl, sessionId);
      set({ notice: "Stop requested. Waiting for the desktop to halt the current run.", error: null });
      await get().refresh();
    } catch (error) {
      await handleStoreError(error, set, get, "Could not stop the current run.");
    }
  },
  async renameCurrentDevice() {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const deviceId = requireValue(get().currentDeviceId, "Current device settings are not available yet.");
      const renamed = await api.renameDevice(token, baseUrl, deviceId, {
        deviceName: get().deviceName.trim()
      });
      await saveSettings({
        baseUrl,
        deviceName: renamed.deviceName,
        currentDeviceId: deviceId,
        autoSpeak: get().autoSpeak,
        autoSendVoice: get().autoSendVoice,
        responseStyle: get().responseStyle
      });
      set((state) => ({
        deviceName: renamed.deviceName,
        devices: state.devices.map((device) => (device.id === renamed.id ? renamed : device)),
        notice: "This phone's device name was updated.",
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not rename this phone.");
    }
  },
  async enablePushNotifications() {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const deviceId = requireValue(get().currentDeviceId, "Current device settings are not available yet.");
      set({ pushSyncing: true, notice: null, error: null });
      const pushToken = await fcm.requestPushToken();
      const updatedDevice = await api.registerPushToken(token, baseUrl, deviceId, { pushToken });
      syncPushTokenRefresh(baseUrl, token, get, set);
      await saveSettings({
        baseUrl,
        deviceName: get().deviceName,
        currentDeviceId: deviceId,
        autoSpeak: get().autoSpeak,
        autoSendVoice: get().autoSendVoice,
        responseStyle: get().responseStyle
      });
      set((state) => ({
        devices: state.devices.map((device) => (device.id === updatedDevice.id ? updatedDevice : device)),
        pushSyncing: false,
        notice: "Android background updates are enabled for this phone.",
        error: null
      }));
    } catch (error) {
      set({ pushSyncing: false });
      await handleStoreError(error, set, get, "Could not enable Android background updates.");
    }
  },
  async toggleNotificationPreference(event) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const deviceId = requireValue(get().currentDeviceId, "Current device settings are not available yet.");
      const currentDevice = get().devices.find((device) => device.id === deviceId);
      if (!currentDevice) {
        throw new Error("Current device settings are not available yet.");
      }
      const updatedDevice = await api.updateNotificationPrefs(token, baseUrl, deviceId, {
        ...currentDevice.notificationPrefs,
        [event]: !currentDevice.notificationPrefs[event]
      });
      set((state) => ({
        devices: state.devices.map((device) => (device.id === updatedDevice.id ? updatedDevice : device)),
        notice: null,
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not update Android background update preferences.");
    }
  },
  async sendDeviceTestNotification(deviceId, event) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      await api.sendTestNotification(token, baseUrl, deviceId, event);
      await get().refresh();
      set({ notice: "Test notification requested.", error: null });
    } catch (error) {
      await handleStoreError(error, set, get, "Could not send a test notification.");
    }
  },
  async revokeDevice(deviceId) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const revoked = await api.revokeDevice(token, baseUrl, deviceId);
      if (deviceId === get().currentDeviceId) {
        await enterRepairMode(set, get, "This phone was revoked. Pair again with the saved desktop URL and pairing code.");
        return;
      }
      set((state) => ({
        devices: state.devices.filter((device) => device.id !== revoked.id),
        notice: `${revoked.deviceName} was revoked.`,
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not revoke that device.");
    }
  },
  async toggleAutoSpeak() {
    const next = !get().autoSpeak;
    await saveSettings({
      baseUrl: get().baseUrl,
      deviceName: get().deviceName,
      currentDeviceId: get().currentDeviceId,
      autoSpeak: next,
      autoSendVoice: get().autoSendVoice,
      responseStyle: get().responseStyle
    });
    set({ autoSpeak: next });
  },
  async toggleAutoSendVoice() {
    const next = !get().autoSendVoice;
    await saveSettings({
      baseUrl: get().baseUrl,
      deviceName: get().deviceName,
      currentDeviceId: get().currentDeviceId,
      autoSpeak: get().autoSpeak,
      autoSendVoice: next,
      responseStyle: get().responseStyle
    });
    set({ autoSendVoice: next });
  },
  async toggleListening() {
    if (!get().voiceAvailable) {
      set({
        listening: false,
        notice: null,
        error: "Voice input is not available on this phone yet. Install or enable the device speech recognition service and try again."
      });
      return;
    }

    if (get().listening) {
      await voice.stopListening();
      set({ listening: false, notice: null, error: null });
      return;
    }

    set({ notice: null, error: null });
    try {
      await voice.startListening(
        (text) => {
          if (get().autoSendVoice && requiresVoiceReview(text)) {
            set({
              composer: text,
              composerInputMode: "voice_polished",
              listening: false,
              notice: "Review the captured voice transcript before sending. Auto-send paused for this turn.",
              error: null,
              view: "chat"
            });
            return;
          }

          set({ composer: text, composerInputMode: "voice", listening: false, notice: null, error: null, view: "chat" });
          maybeAutoSendVoiceResult(get, set).catch(() => undefined);
        },
        (message) => {
          set({ listening: false, notice: null, error: message });
        }
      );
      set({ listening: true, notice: get().autoSendVoice ? "Listening. Completed speech will send automatically unless review is required." : null });
    } catch (error) {
      set({
        listening: false,
        notice: null,
        error: error instanceof Error ? error.message : "Voice recognition could not start."
      });
      throw error;
    }
  },
  async setResponseStyle(style) {
    await saveSettings({
      baseUrl: get().baseUrl,
      deviceName: get().deviceName,
      currentDeviceId: get().currentDeviceId,
      autoSpeak: get().autoSpeak,
      autoSendVoice: get().autoSendVoice,
      responseStyle: style
    });
    set({ responseStyle: style, notice: `Reply style set to ${style}.`, error: null });
  },
  setRenameDraft(sessionId, value) {
    set((state) => ({
      renameDraftBySession: {
        ...state.renameDraftBySession,
        [sessionId]: value
      }
    }));
  },
  setField(field, value) {
    if (field === "composer" && value === "") {
      set({ composer: "", composerInputMode: "text" });
      return;
    }
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
  disconnectSocket({ keepReconnectIntent: true });
  shouldReconnect = true;
  const startRealtime = async () => {
    try {
      const realtime = await api.createRealtimeTicket(token, baseUrl);
      const nextSocket = new WebSocket(`${websocketUrlFromBase(baseUrl)}?ticket=${encodeURIComponent(realtime.ticket)}`);
      let dropHandled = false;
      socket = nextSocket;

      nextSocket.onopen = () => {
        if (socket !== nextSocket) {
          return;
        }
        reconnectAttempts = 0;
        clearReconnectTimer();
        set({ realtimeConnected: true, error: null });
        get().refresh().catch(() => undefined);
      };

      nextSocket.onmessage = (event) => {
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

      const handleDrop = () => {
        if (dropHandled || socket !== nextSocket) {
          return;
        }
        dropHandled = true;
        socket = null;
        set({
          realtimeConnected: false,
          error: "Realtime connection dropped. Reconnecting now. Pull to refresh, tap Refresh Host, or reopen the app if it does not recover."
        });
        scheduleReconnect(baseUrl, token, set, get);
      };

      nextSocket.onerror = handleDrop;
      nextSocket.onclose = handleDrop;
    } catch (error) {
      set({
        realtimeConnected: false,
        error: error instanceof Error ? error.message : "Realtime connection setup failed."
      });
      scheduleReconnect(baseUrl, token, set, get);
    }
  };
  startRealtime().catch(() => undefined);
}

let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let shouldReconnect = false;

function disconnectSocket(options?: { keepReconnectIntent?: boolean }): void {
  clearReconnectTimer();
  shouldReconnect = options?.keepReconnectIntent ?? false;
  if (!socket) {
    return;
  }
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  socket.close();
  socket = null;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) {
    return;
  }
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function scheduleReconnect(
  baseUrl: string,
  token: string,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  _get: () => AppState
): void {
  if (!shouldReconnect || reconnectTimer) {
    return;
  }

  reconnectAttempts += 1;
  const delayMs = Math.min(10_000, 1_000 * 2 ** Math.min(reconnectAttempts - 1, 3));
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!shouldReconnect) {
      return;
    }
    connectSocket(baseUrl, token, set, _get);
  }, delayMs);
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
      sessions: sortSessionsForDisplay([payload.session, ...state.sessions.filter((item) => item.id !== payload.session.id)]),
      renameDraftBySession: {
        ...state.renameDraftBySession,
        [payload.session.id]: payload.session.title
      }
    }));
    if (!isSessionBusy(payload.session)) {
      maybeAutoSendVoiceResult(get, set).catch(() => undefined);
    }
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

async function ensureOperatorSession(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  options?: {
    token?: string | null;
    baseUrl?: string | null;
    hostStatus?: HostStatus | null;
  }
): Promise<ChatSession | null> {
  const existing = findOperatorSession(get().sessions);
  if (existing) {
    return existing;
  }

  const token = options?.token ?? get().token;
  const baseUrl = options?.baseUrl ?? get().baseUrl;
  const hostStatus = options?.hostStatus ?? get().hostStatus;
  const rootPath = get().newSessionRootPath || hostStatus?.host.approvedRoots[0];

  if (!token || !baseUrl || !rootPath) {
    return null;
  }

  const session = await api.createSession(token, baseUrl, {
    rootPath,
    title: OPERATOR_SESSION_TITLE,
    kind: "operator"
  });

  set((state) => ({
    sessions: sortSessionsForDisplay([session, ...state.sessions.filter((item) => item.id !== session.id)]),
    selectedSessionId: state.selectedSessionId ?? session.id,
    renameDraftBySession: {
      ...state.renameDraftBySession,
      [session.id]: session.title
    },
    view: "chat",
    notice: "Operator chat is ready.",
    error: null
  }));

  return session;
}

async function maybeAutoSendVoiceResult(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  if (!isQueuedVoiceAutoSendPending(get().autoSendVoice, get().composer, get().composerInputMode) || get().sendingMessage) {
    return;
  }

  const targetSession = findSendTargetSession(get().selectedSessionId, get().sessions);
  if (isSessionBusy(targetSession)) {
    set({
      notice: "Voice captured. Codex is still busy, so your transcript is waiting in the composer until this run finishes or you tap Stop.",
      error: null,
      view: "chat"
    });
    return;
  }

  try {
    await get().sendMessage();
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : "Voice captured, but the desktop could not send the message yet."
    });
  }
}

async function handleStoreError(
  error: unknown,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  fallbackMessage: string
): Promise<void> {
  const message = error instanceof Error ? error.message : fallbackMessage;

  if (isPairingRepairErrorMessage(message)) {
    await enterRepairMode(set, get, pairingRepairMessage());
    return;
  }

  set({ notice: null, error: message || fallbackMessage });
}

async function enterRepairMode(
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  message: string
): Promise<void> {
  disconnectSocket();
  tts.stop();
  unsubscribePushTokenRefresh?.();
  unsubscribePushTokenRefresh = null;
  await clearDeviceToken();
  set({
    token: null,
    hostStatus: null,
    sessions: [],
    selectedSessionId: null,
    messagesBySession: {},
    composer: "",
    composerInputMode: "text",
    newSessionRootPath: "",
    newSessionTitle: "",
    projectIntent: "",
    projectInstructions: "",
    projectOutputType: "implementation plan",
    projectTemplateId: "greenfield",
    renameDraftBySession: {},
    refreshing: false,
    sendingMessage: false,
    realtimeConnected: false,
    listening: false,
    lastSpokenMessageId: null,
    notice: "Saved desktop settings were kept so you can repair this link quickly.",
    error: message,
    view: "host"
  });
}

function syncPushTokenRefresh(
  baseUrl: string,
  token: string,
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): void {
  unsubscribePushTokenRefresh?.();
  unsubscribePushTokenRefresh = fcm.subscribeToTokenRefresh((pushToken) => {
    const currentDeviceId = get().currentDeviceId;
    if (!currentDeviceId) {
      return;
    }
    api
      .registerPushToken(token, baseUrl, currentDeviceId, { pushToken })
      .then((updatedDevice) => {
        set((state) => ({
          devices: state.devices.map((device) => (device.id === updatedDevice.id ? updatedDevice : device))
        }));
      })
      .catch(() => undefined);
  });
}
