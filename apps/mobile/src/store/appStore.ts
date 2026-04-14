import { create } from "zustand";
import { Platform } from "react-native";
import { buildProjectStarterPrompt } from "@adam-connect/shared";
import type {
  ChatMessage,
  ChatSession,
  HostStatus,
  InputMode,
  NotificationEvent,
  OutboundRecipient,
  PairedDevice,
  ResponseStyle,
  StreamEvent,
  WakeControl
} from "@adam-connect/shared";
import type { ProjectTemplateId } from "@adam-connect/shared";
import { ApiClient } from "../services/api/client";
import { clearSettings, loadSettings, saveSettings, type StoredSettings } from "../services/storage/settingsStorage";
import { clearDeviceToken, loadDeviceToken, saveDeviceToken } from "../services/storage/tokenStorage";
import { FcmService } from "../services/notifications/fcmService";
import { AssistantSpeechRuntime } from "../services/voice/assistantSpeechRuntime";
import { TtsService, type TtsVoiceOption } from "../services/voice/ttsService";
import { VoiceService } from "../services/voice/voiceService";
import { WakeRelayClient } from "../services/wake/wakeRelayClient";
import { normalizeBaseUrl, websocketUrlFromBase } from "../config";
import {
  DEFAULT_BASE_URL,
  VOICE_BACKCHANNEL_MAX_WORDS,
  VOICE_INTERRUPT_MIN_CHARS,
  VOICE_SESSION_ENABLED,
  VOICE_TTS_MIN_CHARS
} from "../generated/runtimeConfig";
import {
  findOperatorSession,
  findManualStopTargetSession,
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
import {
  isExternalSendCancellation,
  isExternalSendConfirmation,
  isValidExternalEmail,
  parseExternalSendRequest,
  type ParsedExternalSendRequest
} from "../utils/externalSend";
import {
  type VoiceSessionPhase,
  mergeVoiceTranscriptSegments,
  normalizeVoiceTranscript,
  shouldInterruptAssistant
} from "../services/voice/voiceSessionMachine";

type View = "host" | "sessions" | "chat";
type EditableField =
  | "baseUrl"
  | "deviceName"
  | "pairingCode"
  | "composer"
  | "newSessionRootPath"
  | "newSessionTitle"
  | "responseStyle"
  | "outboundRecipientLabelDraft"
  | "outboundRecipientEmailDraft"
  | "projectIntent"
  | "projectInstructions"
  | "projectOutputType"
  | "projectTemplateId";

interface VoiceTelemetry {
  turnsStarted: number;
  turnsCompleted: number;
  interruptions: number;
  reconnects: number;
  lastHeardAt: string | null;
  lastAssistantStartedAt: string | null;
  lastRoundTripMs: number | null;
}

interface ExternalDraftState {
  sessionId: string;
  messageId: string;
  recipientId: string | null;
  recipientLabel: string | null;
  recipientDestination: string;
  subject: string;
  intro: string;
  confirmationRequired: boolean;
}

interface PendingExternalRequestState {
  sessionId: string;
  userMessageId: string;
  recipientId: string | null;
  recipientLabel: string | null;
  recipientDestination: string;
  requestedByVoice: boolean;
  requestedSubject: string | null;
  requestedBody: string | null;
}

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
  assistantVoices: TtsVoiceOption[];
  selectedAssistantVoiceId: string | null;
  wakeControl: WakeControl | null;
  wakeRequesting: boolean;
  outboundRecipients: OutboundRecipient[];
  outboundRecipientLabelDraft: string;
  outboundRecipientEmailDraft: string;
  externalDraft: ExternalDraftState | null;
  pendingExternalRequest: PendingExternalRequestState | null;
  sendingExternalMessage: boolean;
  renameDraftBySession: Record<string, string>;
  autoSpeak: boolean;
  autoSendVoice: boolean;
  voiceAvailable: boolean;
  pushAvailable: boolean;
  pushSyncing: boolean;
  listening: boolean;
  voiceSessionActive: boolean;
  voiceMuted: boolean;
  voiceSessionPhase: VoiceSessionPhase;
  liveTranscript: string;
  voiceAudioLevel: number;
  voiceAssistantDraft: string | null;
  voiceTelemetry: VoiceTelemetry;
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
  testAssistantVoice(): Promise<void>;
  triggerWakeHomebase(): Promise<void>;
  addOutboundRecipient(): Promise<void>;
  deleteOutboundRecipient(recipientId: string): Promise<void>;
  beginExternalMessageDraft(messageId: string, sessionId: string): void;
  cancelExternalMessageDraft(): void;
  updateExternalDraft(field: "recipientId" | "recipientDestination" | "subject" | "intro", value: string): void;
  sendExternalMessage(): Promise<void>;
  toggleListening(): Promise<void>;
  toggleVoiceMute(): Promise<void>;
  setResponseStyle(style: ResponseStyle): Promise<void>;
  selectAssistantVoice(voiceId: string | null): Promise<void>;
  setRenameDraft(sessionId: string, value: string): void;
  setField<K extends EditableField>(field: K, value: AppState[K]): void;
  setView(view: View): void;
}

const api = new ApiClient();
const voice = new VoiceService();
const fcm = new FcmService();
const tts = new TtsService();
const assistantSpeech = new AssistantSpeechRuntime(tts);
const wakeRelay = new WakeRelayClient();
let socket: WebSocket | null = null;
let unsubscribePushTokenRefresh: (() => void) | null = null;
let voiceInterruptRequested = false;
const SHOULD_PAUSE_RECOGNITION_DURING_TTS = Platform.OS === "android";
const VOICE_CONTINUATION_GRACE_MS = 1400;
let pendingVoiceTranscript: string | null = null;
let pendingVoiceCommitTimer: ReturnType<typeof setTimeout> | null = null;

const defaultVoiceTelemetry = (): VoiceTelemetry => ({
  turnsStarted: 0,
  turnsCompleted: 0,
  interruptions: 0,
  reconnects: 0,
  lastHeardAt: null,
  lastAssistantStartedAt: null,
  lastRoundTripMs: null
});

function normalizeStoredSettings(settings: Partial<StoredSettings> & Pick<StoredSettings, "baseUrl" | "deviceName" | "autoSpeak" | "autoSendVoice">): StoredSettings {
  return {
    baseUrl: settings.baseUrl,
    deviceName: settings.deviceName,
    currentDeviceId: settings.currentDeviceId ?? null,
    autoSpeak: settings.autoSpeak,
    autoSendVoice: settings.autoSendVoice,
    responseStyle: settings.responseStyle ?? "natural",
    assistantVoiceId: settings.assistantVoiceId ?? null,
    wakeControl: settings.wakeControl ?? null
  };
}

function buildStoredSettings(state: AppState, overrides: Partial<StoredSettings> = {}): StoredSettings {
  return normalizeStoredSettings({
    baseUrl: overrides.baseUrl ?? state.baseUrl,
    deviceName: overrides.deviceName ?? state.deviceName,
    currentDeviceId: overrides.currentDeviceId ?? state.currentDeviceId,
    autoSpeak: overrides.autoSpeak ?? state.autoSpeak,
    autoSendVoice: overrides.autoSendVoice ?? state.autoSendVoice,
    responseStyle: overrides.responseStyle ?? state.responseStyle,
    assistantVoiceId: overrides.assistantVoiceId ?? state.selectedAssistantVoiceId,
    wakeControl: overrides.wakeControl ?? state.wakeControl
  });
}

async function persistSettings(get: () => AppState, overrides: Partial<StoredSettings> = {}): Promise<void> {
  await saveSettings(buildStoredSettings(get(), overrides));
}

async function loadAssistantVoiceState(preferredVoiceId: string | null): Promise<{
  assistantVoices: TtsVoiceOption[];
  selectedAssistantVoiceId: string | null;
}> {
  await tts.prepare(preferredVoiceId).catch(() => false);
  await tts.setPreferredVoice(preferredVoiceId).catch(() => null);
  const assistantVoices = await tts.listVoices().catch(() => []);
  const selectedAssistantVoiceId =
    preferredVoiceId && assistantVoices.some((voiceOption) => voiceOption.id === preferredVoiceId) ? preferredVoiceId : null;

  return {
    assistantVoices,
    selectedAssistantVoiceId
  };
}

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
  assistantVoices: [],
  selectedAssistantVoiceId: null,
  wakeControl: null,
  wakeRequesting: false,
  outboundRecipients: [],
  outboundRecipientLabelDraft: "",
  outboundRecipientEmailDraft: "",
  externalDraft: null,
  pendingExternalRequest: null,
  sendingExternalMessage: false,
  renameDraftBySession: {},
  autoSpeak: false,
  autoSendVoice: true,
  voiceAvailable: false,
  pushAvailable: false,
  pushSyncing: false,
  listening: false,
  voiceSessionActive: false,
  voiceMuted: false,
  voiceSessionPhase: "idle",
  liveTranscript: "",
  voiceAudioLevel: -2,
  voiceAssistantDraft: null,
  voiceTelemetry: defaultVoiceTelemetry(),
  lastSpokenMessageId: null,
  notice: null,
  error: null,
  async bootstrap() {
    voice.stopStreamingSession();
    assistantSpeech.configure({
      onBeforeSpeak: () => {
        pauseVoiceLoopForAssistant(get, set);
      },
      onSpeakingChange: (speaking) => {
        set((state) => {
          if (!state.voiceSessionActive) {
            return {};
          }

          if (speaking) {
            return {
              voiceSessionPhase: state.voiceMuted ? "muted" : "assistant-speaking",
              voiceTelemetry: {
                ...state.voiceTelemetry,
                lastAssistantStartedAt: new Date().toISOString()
              }
            };
          }

          if (state.voiceSessionPhase === "assistant-speaking" || state.voiceSessionPhase === "muted") {
            return {
              listening: SHOULD_PAUSE_RECOGNITION_DURING_TTS ? false : state.listening,
              voiceSessionPhase: state.voiceMuted ? "muted" : state.error ? "error" : "listening"
            };
          }

          return {};
        });

        if (!speaking && !get().voiceMuted) {
          ensureVoiceLoopListening(get, set).catch(() => undefined);
        }
      },
      onSpeechError: (message) => {
        set((state) => ({
          notice: message,
          listening: SHOULD_PAUSE_RECOGNITION_DURING_TTS ? false : state.listening,
          voiceSessionPhase: state.voiceSessionActive ? (state.voiceMuted ? "muted" : "listening") : state.voiceSessionPhase
        }));
        if (!get().voiceMuted) {
          ensureVoiceLoopListening(get, set).catch(() => undefined);
        }
      }
    });

    const [settings, token, voiceAvailable] = await Promise.all([
      loadSettings(),
      loadDeviceToken(),
      voice.isAvailable()
    ]);

    const assistantVoiceState = await loadAssistantVoiceState(settings?.assistantVoiceId ?? null);
    if (settings?.assistantVoiceId && assistantVoiceState.selectedAssistantVoiceId === null) {
      await saveSettings({
        ...normalizeStoredSettings({
          baseUrl: settings.baseUrl,
          deviceName: settings.deviceName,
          currentDeviceId: settings.currentDeviceId ?? null,
          autoSpeak: settings.autoSpeak,
          autoSendVoice: settings.autoSendVoice,
          responseStyle: settings.responseStyle,
          assistantVoiceId: null,
          wakeControl: settings.wakeControl ?? null
        })
      });
    }

    set({
      baseUrl: settings?.baseUrl ?? DEFAULT_BASE_URL,
      deviceName: settings?.deviceName ?? "Adam's Phone",
      currentDeviceId: settings?.currentDeviceId ?? null,
      autoSpeak: settings?.autoSpeak ?? false,
      autoSendVoice: settings?.autoSendVoice ?? true,
      responseStyle: settings?.responseStyle ?? "natural",
      assistantVoices: assistantVoiceState.assistantVoices,
      selectedAssistantVoiceId: assistantVoiceState.selectedAssistantVoiceId,
      wakeControl: settings?.wakeControl ?? null,
      outboundRecipients: [],
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
      await persistSettings(get, {
        baseUrl,
        deviceName: get().deviceName.trim(),
        currentDeviceId: paired.device.id
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
          wakeControl: settingsWakeControl(get),
          outboundEmail: {
            enabled: false,
            provider: "none",
            fromAddress: null,
            replyToAddress: null,
            recipientCount: 0
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
    clearPendingVoiceTranscript();
    disconnectSocket();
    voice.stopStreamingSession();
    assistantSpeech.reset();
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
      responseStyle: "natural",
      assistantVoices: [],
      selectedAssistantVoiceId: null,
      wakeControl: null,
      wakeRequesting: false,
      outboundRecipients: [],
      outboundRecipientLabelDraft: "",
      outboundRecipientEmailDraft: "",
      externalDraft: null,
      pendingExternalRequest: null,
      sendingExternalMessage: false,
      renameDraftBySession: {},
      autoSpeak: false,
      autoSendVoice: true,
      listening: false,
      voiceSessionActive: false,
      voiceMuted: false,
      voiceSessionPhase: "idle",
      liveTranscript: "",
      voiceAudioLevel: -2,
      voiceAssistantDraft: null,
      voiceTelemetry: defaultVoiceTelemetry(),
      lastSpokenMessageId: null,
      notice: null,
      refreshing: false,
      sendingMessage: false,
      realtimeConnected: false,
      error: null,
      view: "host"
    });
    voiceInterruptRequested = false;
  },
  async refresh() {
    const token = requireValue(get().token, "Pair this phone with the desktop first.");
    const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
    set({ refreshing: true });
    try {
      const [hostStatus, sessions, devices, outboundRecipients] = await Promise.all([
        api.getHostStatus(token, baseUrl),
        api.listSessions(token, baseUrl),
        api.listDevices(token, baseUrl),
        api.listOutboundRecipients(token, baseUrl)
      ]);
      const currentSelected = get().selectedSessionId;
      const nextSelected = pickPreferredSessionId(currentSelected, sessions);
      const currentDeviceId =
        get().currentDeviceId && devices.some((device) => device.id === get().currentDeviceId)
          ? get().currentDeviceId
          : devices.find((device) => device.deviceName === get().deviceName)?.id ?? devices[0]?.id ?? null;

      if (currentDeviceId !== get().currentDeviceId || !wakeControlsEqual(hostStatus.wakeControl, get().wakeControl)) {
        await persistSettings(get, {
          baseUrl,
          currentDeviceId,
          wakeControl: hostStatus.wakeControl
        });
      }

      set({
        hostStatus,
        wakeControl: hostStatus.wakeControl,
        devices,
        outboundRecipients,
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
    set((state) => ({
      notice: "Reconnecting the realtime desktop link.",
      error: null,
      realtimeConnected: false,
      voiceSessionPhase: state.voiceSessionActive ? "reconnecting" : state.voiceSessionPhase
    }));
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
      clearPendingVoiceTranscript();
      const text = get().composer.trim();
      if (!text) {
        return;
      }

      if (tryHandleExternalDraftVoiceCommand(text, get, set)) {
        return;
      }

      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");

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
        const isVoiceTurn = get().composerInputMode === "voice" || get().composerInputMode === "voice_polished";
        if (get().voiceSessionActive && isVoiceTurn && !voiceInterruptRequested) {
          voiceInterruptRequested = true;
          assistantSpeech.stop();
          set((state) => ({
            notice: "Codex is still busy, so Adam Connect is stopping the current run and will send your new voice turn next.",
            error: null,
            view: "chat",
            voiceSessionPhase: state.voiceSessionActive ? "interrupted" : state.voiceSessionPhase
          }));
          requestVoiceInterrupt(get, set).catch(() => undefined);
          return;
        }

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
      const isVoiceTurn = get().composerInputMode === "voice";
      const parsedExternalRequest = parseExternalSendRequest(text, get().outboundRecipients);
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
        liveTranscript: "",
        voiceAudioLevel: -2,
        pendingExternalRequest: parsedExternalRequest
          ? buildPendingExternalRequest(resolvedSessionId, message.id, parsedExternalRequest, state.composerInputMode === "voice")
          : state.pendingExternalRequest,
        voiceSessionPhase:
          state.voiceSessionActive && isVoiceTurn
            ? "processing"
            : state.voiceSessionActive && state.voiceSessionPhase !== "review"
              ? state.voiceSessionPhase
              : "idle",
        messagesBySession: {
          ...state.messagesBySession,
          [resolvedSessionId]: [...(state.messagesBySession[resolvedSessionId] ?? []), message]
        },
        voiceTelemetry:
          state.voiceSessionActive && isVoiceTurn
            ? {
                ...state.voiceTelemetry,
                turnsStarted: state.voiceTelemetry.turnsStarted + 1
              }
            : state.voiceTelemetry,
        error: null
      }));
      if (parsedExternalRequest) {
        set({
          notice: `Adam Connect will prepare an email draft for ${parsedExternalRequest.recipientDestination} after this reply finishes, then wait for your confirmation.`,
          error: null
        });
      }
      await get().refresh();
    } catch (error) {
      await handleStoreError(error, set, get, "Could not send that message.");
    } finally {
      set({ sendingMessage: false });
    }
  },
  async stopSession() {
    try {
      const shouldStopVoiceLoop = get().voiceSessionActive || Boolean(get().voiceAssistantDraft);
      if (shouldStopVoiceLoop) {
        stopActiveVoiceLoop(set, {
          notice: null,
          error: null
        });
      } else {
        clearPendingVoiceTranscript();
        assistantSpeech.stop();
      }

      const token = get().token;
      const baseUrl = get().baseUrl;
      const targetSession = findManualStopTargetSession(get().selectedSessionId, get().sessions);

      if (!token || !baseUrl || !targetSession) {
        if (shouldStopVoiceLoop) {
          set({
            notice: "Voice loop stopped on this phone.",
            error: null
          });
          return;
        }

        throw new Error("Open a chat before stopping a run.");
      }

      const stoppedSession = await api.stopSession(token, baseUrl, targetSession.id);
      set((state) => ({
        sessions: sortSessionsForDisplay([stoppedSession, ...state.sessions.filter((item) => item.id !== stoppedSession.id)]),
        notice: shouldStopVoiceLoop
          ? isSessionBusy(targetSession)
            ? "Voice loop stopped. Waiting for the desktop to halt the current run."
            : "Voice loop stopped. Adam Connect is also checking this chat for a stuck or queued run."
          : isSessionBusy(targetSession)
            ? "Stop requested. Waiting for the desktop to halt the current run."
            : "Stop requested for recovery. Adam Connect is checking for a stuck or queued run in this chat.",
        error: null
      }));
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
      await persistSettings(get, {
        baseUrl,
        deviceName: renamed.deviceName,
        currentDeviceId: deviceId
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
      await persistSettings(get, {
        baseUrl,
        currentDeviceId: deviceId
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
    await persistSettings(get, { autoSpeak: next });
    set({ autoSpeak: next });
  },
  async toggleAutoSendVoice() {
    const next = !get().autoSendVoice;
    await persistSettings(get, { autoSendVoice: next });
    set({ autoSendVoice: next });
  },
  async testAssistantVoice() {
    if (get().voiceSessionActive) {
      set({
        notice: "End the live voice loop before running the spoken-reply test.",
        error: null
      });
      return;
    }

    voice.stopStreamingSession();
    assistantSpeech.stop();
    const assistantVoiceState = await loadAssistantVoiceState(get().selectedAssistantVoiceId);
    const detail = await tts.describeAvailability();
    const spoken = tts.speak("This is Adam Connect. If you can hear this, spoken replies are working on this phone.");
    set({
      assistantVoices: assistantVoiceState.assistantVoices,
      selectedAssistantVoiceId: assistantVoiceState.selectedAssistantVoiceId,
      notice: spoken ? `Testing spoken reply. ${detail}` : detail,
      error: null
    });
  },
  async triggerWakeHomebase() {
    const wakeControl = get().wakeControl;
    if (!wakeControl?.enabled) {
      set({
        notice: null,
        error: "Wake-on-request is not configured on this desktop yet."
      });
      return;
    }

    set({
      wakeRequesting: true,
      notice: `Sending a wake request for ${wakeControl.targetLabel ?? "Homebase"}...`,
      error: null
    });

    try {
      const result = await wakeRelay.wake(wakeControl);
      set({
        wakeRequesting: false,
        notice:
          result.status === "awake"
            ? `${result.targetLabel} is waking up now. Adam Connect will reconnect when the desktop heartbeat comes back.`
            : `${result.targetLabel} wake result: ${result.status}. ${result.detail ?? "Waiting for the desktop heartbeat."}`,
        error: result.status === "error" ? result.detail ?? "Wake relay reported an error." : null
      });
    } catch (error) {
      set({
        wakeRequesting: false,
        notice: null,
        error: error instanceof Error ? error.message : "Could not reach the wake relay."
      });
    }
  },
  async addOutboundRecipient() {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      const label = get().outboundRecipientLabelDraft.trim();
      const destination = get().outboundRecipientEmailDraft.trim();
      if (!label || !destination) {
        set({
          notice: null,
          error: "Add both a recipient label and an email address first."
        });
        return;
      }

      const recipient = await api.createOutboundRecipient(token, baseUrl, {
        label,
        destination
      });
      set((state) => ({
        outboundRecipients: [...state.outboundRecipients.filter((item) => item.id !== recipient.id), recipient].sort((left, right) =>
          left.label.localeCompare(right.label)
        ),
        outboundRecipientLabelDraft: "",
        outboundRecipientEmailDraft: "",
        hostStatus: state.hostStatus
          ? {
              ...state.hostStatus,
              outboundEmail: {
                ...state.hostStatus.outboundEmail,
                recipientCount: state.hostStatus.outboundEmail.recipientCount + 1
              }
            }
          : state.hostStatus,
        notice: `${recipient.label} is now a trusted outbound recipient.`,
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not add that outbound recipient.");
    }
  },
  async deleteOutboundRecipient(recipientId) {
    try {
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      await api.deleteOutboundRecipient(token, baseUrl, recipientId);
      set((state) => ({
        outboundRecipients: state.outboundRecipients.filter((item) => item.id !== recipientId),
        externalDraft:
          state.externalDraft?.recipientId === recipientId
            ? {
                ...state.externalDraft,
                recipientId: null
              }
            : state.externalDraft,
        hostStatus: state.hostStatus
          ? {
              ...state.hostStatus,
              outboundEmail: {
                ...state.hostStatus.outboundEmail,
                recipientCount: Math.max(0, state.hostStatus.outboundEmail.recipientCount - 1)
              }
            }
          : state.hostStatus,
        notice: "Trusted outbound recipient removed.",
        error: null
      }));
    } catch (error) {
      await handleStoreError(error, set, get, "Could not remove that outbound recipient.");
    }
  },
  beginExternalMessageDraft(messageId, sessionId) {
    const session = get().sessions.find((item) => item.id === sessionId) ?? null;
    const message = get().messagesBySession[sessionId]?.find((item) => item.id === messageId) ?? null;
    if (!session || !message || message.role !== "assistant" || message.status !== "completed") {
      set({
        notice: null,
        error: "Choose a completed assistant reply before sending it externally."
      });
      return;
    }

    set((state) => ({
      externalDraft: {
        sessionId,
        messageId,
        recipientId: state.outboundRecipients[0]?.id ?? null,
        recipientLabel: state.outboundRecipients[0]?.label ?? null,
        recipientDestination: state.outboundRecipients[0]?.destination ?? "",
        subject: buildExternalSubject(session.title, message.content),
        intro: "",
        confirmationRequired: false
      },
      notice: state.outboundRecipients.length
        ? "External send draft ready. Choose a recipient, review the subject, and send when ready."
        : "External send draft ready. Add a trusted recipient on the Host tab before sending.",
      error: null,
      view: "chat"
    }));
  },
  cancelExternalMessageDraft() {
    set({
      externalDraft: null,
      pendingExternalRequest: null,
      sendingExternalMessage: false,
      notice: null,
      error: null
    });
  },
  updateExternalDraft(field, value) {
    set((state) => ({
      externalDraft: state.externalDraft
        ? {
            ...state.externalDraft,
            ...(field === "recipientId"
              ? resolveExternalDraftRecipientSelection(state.outboundRecipients, value)
              : field === "recipientDestination"
                ? {
                    recipientId: null,
                    recipientLabel: null,
                    recipientDestination: value
                  }
                : { [field]: value })
          }
        : state.externalDraft
    }));
  },
  async sendExternalMessage() {
    try {
      const draft = requireValue(get().externalDraft, "Choose a completed assistant reply before sending it externally.");
      const token = requireValue(get().token, "Pair this phone with the desktop first.");
      const baseUrl = requireValue(get().baseUrl, "Desktop URL is required.");
      if (!draft.recipientId && !draft.recipientDestination.trim()) {
        set({
          notice: null,
          error: "Choose or enter an email recipient before sending externally."
        });
        return;
      }
      if (!draft.recipientId && !isValidExternalEmail(draft.recipientDestination)) {
        set({
          notice: null,
          error: "Enter a valid email address before sending externally."
        });
        return;
      }

      set({
        sendingExternalMessage: true,
        notice: null,
        error: null
      });
      const response = await api.sendExternalMessage(token, baseUrl, {
        sessionId: draft.sessionId,
        messageId: draft.messageId,
        ...(draft.recipientId ? { recipientId: draft.recipientId } : {}),
        ...(!draft.recipientId
          ? {
              recipientDestination: draft.recipientDestination.trim(),
              recipientLabel: draft.recipientLabel ?? draft.recipientDestination.trim()
            }
          : {}),
        subject: draft.subject.trim(),
        intro: draft.intro.trim()
      });
      set({
        sendingExternalMessage: false,
        externalDraft: null,
        pendingExternalRequest: null,
        notice: `External report sent to ${response.recipient.destination}.`,
        error: null
      });
      await get().refresh();
    } catch (error) {
      set({ sendingExternalMessage: false });
      await handleStoreError(error, set, get, "Could not send that external report.");
    }
  },
  async toggleListening() {
    if (!VOICE_SESSION_ENABLED) {
      set({
        listening: false,
        voiceSessionActive: false,
        voiceMuted: false,
        voiceSessionPhase: "error",
        notice: null,
        error: "Realtime voice sessions are disabled in this build."
      });
      return;
    }

    if (!get().voiceAvailable) {
      set({
        listening: false,
        voiceSessionActive: false,
        voiceMuted: false,
        voiceSessionPhase: "error",
        notice: null,
        error: "Voice input is not available on this phone yet. Install or enable the device speech recognition service and try again."
      });
      return;
    }

    if (get().voiceSessionActive) {
      stopActiveVoiceLoop(set, {
        notice: null,
        error: null
      });
      return;
    }

    set({
        notice: "Voice loop starting. Speak naturally and Adam Connect will keep listening between turns.",
        error: null,
        voiceSessionActive: true,
        voiceMuted: false,
        listening: true,
        voiceSessionPhase: "connecting",
      liveTranscript: "",
      voiceAudioLevel: -2,
      voiceAssistantDraft: null
    });
    voiceInterruptRequested = false;

    if (!(await tts.prepare())) {
      set({
        notice: "Voice loop is live, but spoken replies are unavailable until Android text-to-speech is ready on this phone.",
        error: null
      });
    }

    await startVoiceLoopRecognition(get, set);
  },
  async toggleVoiceMute() {
    const state = get();
    if (!state.voiceSessionActive) {
      set({
        notice: "Start the voice loop first, then mute your microphone when you need a quieter side channel.",
        error: null
      });
      return;
    }

    if (state.voiceMuted) {
      set({
        voiceMuted: false,
        notice: pendingVoiceTranscript
          ? "Microphone live again. Finish your thought, or stay quiet and Adam Connect will send the held turn."
          : "Microphone live again.",
        error: null,
        voiceSessionPhase: "connecting"
      });
      await startVoiceLoopRecognition(get, set);
      if (pendingVoiceTranscript) {
        schedulePendingVoiceCommit(get, set);
      }
      return;
    }

    clearPendingVoiceCommitTimer();
    voice.stopStreamingSession();
    set({
      voiceMuted: true,
      listening: false,
      voiceAudioLevel: -2,
      voiceSessionPhase: "muted",
      notice: pendingVoiceTranscript
        ? "Microphone muted. Adam Connect is holding your unfinished turn until you unmute."
        : "Microphone muted. Adam Connect will keep speaking, but it will ignore your side until you unmute.",
      error: null
    });
  },
  async setResponseStyle(style) {
    await persistSettings(get, { responseStyle: style });
    set({ responseStyle: style, notice: `Reply style set to ${style}.`, error: null });
  },
  async selectAssistantVoice(voiceId) {
    const assistantVoiceState = await loadAssistantVoiceState(voiceId);
    await persistSettings(get, {
      assistantVoiceId: assistantVoiceState.selectedAssistantVoiceId
    });
    const selectedVoice =
      assistantVoiceState.assistantVoices.find((voiceOption) => voiceOption.id === assistantVoiceState.selectedAssistantVoiceId) ?? null;
    set({
      assistantVoices: assistantVoiceState.assistantVoices,
      selectedAssistantVoiceId: assistantVoiceState.selectedAssistantVoiceId,
      notice: selectedVoice
        ? `Spoken reply voice set to ${selectedVoice.label}. Use Test Spoken Reply to preview it.`
        : "Spoken reply voice reset to automatic. Adam Connect will use the phone's default English voice.",
      error: null
    });
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

function buildVoiceSessionCallbacks(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Parameters<VoiceService["startStreamingSession"]>[0] {
  return {
    onListening: () => {
      set((state) => ({
        listening: state.voiceMuted ? false : true,
        voiceSessionPhase: state.voiceMuted ? "muted" : state.voiceSessionPhase === "assistant-speaking" ? state.voiceSessionPhase : "listening",
        error: null
      }));
    },
    onSpeechStart: () => {
      if (get().voiceMuted) {
        return;
      }
      clearPendingVoiceCommitTimer();
      set((state) => ({
        listening: true,
        voiceSessionPhase: state.voiceSessionActive ? "user-speaking" : state.voiceSessionPhase
      }));
    },
    onSpeechEnd: () => {
      set((state) => {
        if (!state.voiceSessionActive) {
          return {};
        }

        if (state.voiceSessionPhase === "user-speaking") {
          return {
            voiceSessionPhase: state.liveTranscript ? "processing" : "listening"
          };
        }

        return {};
      });
    },
    onVolume: (value) => {
      if (get().voiceMuted) {
        return;
      }
      set({ voiceAudioLevel: value });
    },
    onPartialTranscript: (text) => {
      if (get().voiceMuted) {
        return;
      }
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        return;
      }

      const merged = pendingVoiceTranscript ? mergeVoiceTranscriptSegments(pendingVoiceTranscript, normalized) : normalized;
      pendingVoiceTranscript = merged;

      set((state) => ({
        liveTranscript: merged,
        voiceSessionPhase: "user-speaking",
        voiceTelemetry: {
          ...state.voiceTelemetry,
          lastHeardAt: new Date().toISOString()
        }
      }));

      if (!voiceInterruptRequested && isVoiceAssistantActive(get) && shouldInterruptAssistant(merged, VOICE_INTERRUPT_MIN_CHARS, VOICE_BACKCHANNEL_MAX_WORDS)) {
        voiceInterruptRequested = true;
        assistantSpeech.stop();
        set((state) => ({
          voiceSessionPhase: "interrupted",
          notice: "Barge-in detected. Stopping the current reply so your next turn can go through.",
          voiceTelemetry: {
            ...state.voiceTelemetry,
            interruptions: state.voiceTelemetry.interruptions + 1
          }
        }));
        requestVoiceInterrupt(get, set).catch(() => undefined);
      }
    },
    onFinalTranscript: (text) => {
      if (get().voiceMuted) {
        return;
      }
      const normalized = normalizeVoiceTranscript(text);
      if (!normalized) {
        set({ liveTranscript: "", voiceSessionPhase: "listening" });
        return;
      }

      const merged = pendingVoiceTranscript ? mergeVoiceTranscriptSegments(pendingVoiceTranscript, normalized) : normalized;
      pendingVoiceTranscript = merged;

      if (isVoiceAssistantActive(get) && !voiceInterruptRequested && !shouldInterruptAssistant(merged, VOICE_INTERRUPT_MIN_CHARS, VOICE_BACKCHANNEL_MAX_WORDS)) {
        clearPendingVoiceTranscript();
        set({ liveTranscript: "", voiceSessionPhase: "assistant-speaking" });
        return;
      }

      set((state) => ({
        liveTranscript: merged,
        voiceSessionPhase: state.voiceSessionActive ? "listening" : state.voiceSessionPhase,
        voiceAudioLevel: -2,
        notice: null,
        error: null,
        view: "chat",
        voiceTelemetry: {
          ...state.voiceTelemetry,
          lastHeardAt: new Date().toISOString()
        }
      }));
      schedulePendingVoiceCommit(get, set);
    },
    onReconnect: () => {
      if (get().voiceMuted) {
        set({ listening: false, voiceSessionPhase: "muted" });
        return;
      }
      set((state) => ({
        listening: false,
        voiceSessionPhase: state.voiceSessionActive ? "reconnecting" : state.voiceSessionPhase,
        voiceTelemetry: {
          ...state.voiceTelemetry,
          reconnects: state.voiceTelemetry.reconnects + 1
        }
      }));
    },
    onError: (message) => {
      clearPendingVoiceTranscript();
      assistantSpeech.stop();
      set({
        listening: false,
        voiceSessionActive: false,
        voiceMuted: false,
        voiceSessionPhase: "error",
        liveTranscript: "",
        voiceAudioLevel: -2,
        notice: null,
        error: message
      });
      voiceInterruptRequested = false;
    }
  };
}

async function startVoiceLoopRecognition(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  if (get().voiceMuted) {
    set({
      listening: false,
      voiceSessionPhase: "muted"
    });
    return;
  }

  try {
    await voice.startStreamingSession(buildVoiceSessionCallbacks(get, set));
  } catch (error) {
    clearPendingVoiceTranscript();
    voice.stopStreamingSession();
    assistantSpeech.stop();
    set({
      listening: false,
      voiceSessionActive: false,
      voiceMuted: false,
      voiceSessionPhase: "error",
      notice: null,
      error: error instanceof Error ? error.message : "Voice recognition could not start."
    });
    throw error;
  }
}

function stopActiveVoiceLoop(
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  overrides?: Pick<AppState, "notice" | "error">
): void {
  clearPendingVoiceTranscript();
  voice.stopStreamingSession();
  assistantSpeech.stop();
  set({
    listening: false,
    voiceSessionActive: false,
    voiceMuted: false,
    voiceSessionPhase: "idle",
    liveTranscript: "",
    voiceAudioLevel: -2,
    voiceAssistantDraft: null,
    notice: overrides?.notice ?? null,
    error: overrides?.error ?? null
  });
  voiceInterruptRequested = false;
}

function settingsWakeControl(get: () => AppState): WakeControl {
  return (
    get().wakeControl ?? {
      enabled: false,
      relayBaseUrl: null,
      relayToken: null,
      targetId: null,
      targetLabel: null
    }
  );
}

function wakeControlsEqual(left: WakeControl | null, right: WakeControl | null): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

function buildExternalSubject(sessionTitle: string, messageContent: string): string {
  const preview = messageContent.trim().replace(/\s+/g, " ").slice(0, 72).trim();
  return preview ? `${sessionTitle}: ${preview}` : `${sessionTitle}: Adam Connect update`;
}

function resolveExternalDraftRecipientSelection(recipients: OutboundRecipient[], recipientId: string): {
  recipientId: string | null;
  recipientLabel: string | null;
  recipientDestination: string;
} {
  const recipient = recipients.find((item) => item.id === recipientId) ?? null;
  return {
    recipientId: recipient?.id ?? null,
    recipientLabel: recipient?.label ?? null,
    recipientDestination: recipient?.destination ?? ""
  };
}

function buildPendingExternalRequest(
  sessionId: string,
  userMessageId: string,
  request: ParsedExternalSendRequest,
  requestedByVoice: boolean
): PendingExternalRequestState {
  return {
    sessionId,
    userMessageId,
    recipientId: request.recipientId,
    recipientLabel: request.recipientLabel,
    recipientDestination: request.recipientDestination,
    requestedByVoice,
    requestedSubject: request.requestedSubject,
    requestedBody: request.requestedBody
  };
}

function buildExternalDraftFromPendingRequest(
  request: PendingExternalRequestState,
  sessionId: string,
  messageId: string,
  sessionTitle: string,
  messageContent: string
): ExternalDraftState {
  return {
    sessionId,
    messageId,
    recipientId: request.recipientId,
    recipientLabel: request.recipientLabel,
    recipientDestination: request.recipientDestination,
    subject: request.requestedSubject ?? buildExternalSubject(sessionTitle, messageContent),
    intro: request.requestedBody ?? "",
    confirmationRequired: true
  };
}

function buildExternalDraftConfirmationPrompt(request: PendingExternalRequestState, draft: ExternalDraftState): string {
  const subjectClause = draft.subject.trim() ? ` Subject: ${draft.subject.trim()}.` : "";
  return `I prepared an email to ${draft.recipientDestination}.${subjectClause} Say yes, send it to confirm, or say cancel.`;
}

function tryHandleExternalDraftVoiceCommand(
  text: string,
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): boolean {
  const draft = get().externalDraft;
  if (!draft) {
    return false;
  }

  if (isExternalSendCancellation(text)) {
    set({
      composer: "",
      composerInputMode: "text",
      externalDraft: null,
      pendingExternalRequest: null,
      notice: "Email draft cancelled.",
      error: null
    });
    return true;
  }

  if (!isExternalSendConfirmation(text)) {
    return false;
  }

  set({
    composer: "",
    composerInputMode: "text",
    notice: `Sending the drafted email to ${draft.recipientDestination}.`,
    error: null
  });
  get().sendExternalMessage().catch(() => undefined);
  return true;
}

function clearPendingVoiceCommitTimer(): void {
  if (!pendingVoiceCommitTimer) {
    return;
  }

  clearTimeout(pendingVoiceCommitTimer);
  pendingVoiceCommitTimer = null;
}

function clearPendingVoiceTranscript(): void {
  clearPendingVoiceCommitTimer();
  pendingVoiceTranscript = null;
}

function schedulePendingVoiceCommit(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): void {
  clearPendingVoiceCommitTimer();
  pendingVoiceCommitTimer = setTimeout(() => {
    pendingVoiceCommitTimer = null;
    commitPendingVoiceTranscript(get, set).catch(() => undefined);
  }, VOICE_CONTINUATION_GRACE_MS);
}

async function commitPendingVoiceTranscript(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  const transcript = normalizeVoiceTranscript(pendingVoiceTranscript ?? "");
  pendingVoiceTranscript = null;
  if (!transcript) {
    return;
  }

  if (get().voiceMuted) {
    pendingVoiceTranscript = transcript;
    return;
  }

  if (requiresVoiceReview(transcript)) {
    voice.stopStreamingSession();
    assistantSpeech.stop();
    set((state) => ({
      composer: transcript,
      composerInputMode: "voice_polished",
      listening: false,
      voiceSessionActive: false,
      voiceSessionPhase: "review",
      liveTranscript: "",
      voiceAudioLevel: -2,
      notice: "Review the captured transcript before sending. Voice loop paused for this turn.",
      error: null,
      view: "chat",
      voiceTelemetry: {
        ...state.voiceTelemetry,
        lastHeardAt: new Date().toISOString()
      }
    }));
    voiceInterruptRequested = false;
    return;
  }

  set((state) => ({
    composer: transcript,
    composerInputMode: "voice",
    liveTranscript: "",
    voiceSessionPhase: "processing",
    voiceAudioLevel: -2,
    notice: null,
    error: null,
    view: "chat",
    voiceTelemetry: {
      ...state.voiceTelemetry,
      lastHeardAt: new Date().toISOString()
    }
  }));
  await maybeAutoSendVoiceResult(get, set);
}

function pauseVoiceLoopForAssistant(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): void {
  if (!SHOULD_PAUSE_RECOGNITION_DURING_TTS) {
    return;
  }

  const state = get();
  if (!state.voiceSessionActive) {
    return;
  }

  clearPendingVoiceCommitTimer();
  voice.stopStreamingSession();
  set({
    listening: false,
    liveTranscript: "",
    voiceAudioLevel: -2
  });
}

async function ensureVoiceLoopListening(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  if (!SHOULD_PAUSE_RECOGNITION_DURING_TTS) {
    return;
  }

  const state = get();
  if (!state.voiceSessionActive || state.voiceMuted || state.voiceSessionPhase === "review" || state.listening) {
    return;
  }

  await startVoiceLoopRecognition(get, set);
}

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
        set((state) => ({
          realtimeConnected: true,
          error: null,
          voiceSessionPhase:
            state.voiceSessionActive && state.voiceSessionPhase === "reconnecting" ? "listening" : state.voiceSessionPhase
        }));
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
        set((state) => ({
          realtimeConnected: false,
          voiceSessionPhase: state.voiceSessionActive ? "reconnecting" : state.voiceSessionPhase,
          error: "Realtime connection dropped. Reconnecting now. Pull to refresh, tap Refresh Host, or reopen the app if it does not recover."
        }));
        scheduleReconnect(baseUrl, token, set, get);
      };

      nextSocket.onerror = handleDrop;
      nextSocket.onclose = handleDrop;
    } catch (error) {
      set((state) => ({
        realtimeConnected: false,
        voiceSessionPhase: state.voiceSessionActive ? "reconnecting" : state.voiceSessionPhase,
        error: error instanceof Error ? error.message : "Realtime connection setup failed."
      }));
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
      wakeControl: payload.hostStatus.wakeControl,
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
      },
      voiceSessionPhase:
        state.voiceSessionActive && !isSessionBusy(payload.session) && state.voiceSessionPhase !== "review"
          ? state.voiceSessionPhase === "assistant-speaking"
            ? state.voiceSessionPhase
            : "listening"
          : state.voiceSessionPhase
    }));
    if (!isSessionBusy(payload.session)) {
      voiceInterruptRequested = false;
      maybeAutoSendVoiceResult(get, set).catch(() => undefined);
    }
    return;
  }

  const currentState = get();
  const pendingExternalRequest =
    currentState.pendingExternalRequest?.sessionId === payload.sessionId ? currentState.pendingExternalRequest : null;
  const preparedExternalDraft =
    payload.message.role === "assistant" &&
    payload.message.status === "completed" &&
    pendingExternalRequest
      ? buildExternalDraftFromPendingRequest(
          pendingExternalRequest,
          payload.sessionId,
          payload.message.id,
          currentState.sessions.find((item) => item.id === payload.sessionId)?.title ?? "Operator",
          payload.message.content
        )
      : null;

  set((state) => {
    const currentMessages = state.messagesBySession[payload.sessionId] ?? [];
    const nextMessages = [...currentMessages.filter((item) => item.id !== payload.message.id), payload.message].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt)
    );
    const resolvedExternalDraft =
      payload.message.role === "assistant" &&
      payload.message.status === "completed" &&
      pendingExternalRequest
        ? preparedExternalDraft
        : state.externalDraft;
    const shouldVoiceSpeak = payload.message.role === "assistant" && (state.autoSpeak || state.voiceSessionActive) && tts.isAvailable();
    const speechQueued =
      shouldVoiceSpeak &&
      assistantSpeech.ingest(payload.message.id, payload.message.content, payload.message.status, VOICE_TTS_MIN_CHARS);
    const voiceTelemetry =
      payload.message.role === "assistant" &&
      payload.message.status === "completed" &&
      state.voiceSessionActive &&
      state.voiceTelemetry.lastHeardAt
        ? {
            ...state.voiceTelemetry,
            turnsCompleted: state.voiceTelemetry.turnsCompleted + 1,
            lastRoundTripMs: Date.now() - new Date(state.voiceTelemetry.lastHeardAt).getTime()
          }
        : state.voiceTelemetry;

    return {
      messagesBySession: {
        ...state.messagesBySession,
        [payload.sessionId]: nextMessages
      },
      externalDraft: resolvedExternalDraft,
      pendingExternalRequest:
        payload.message.role === "assistant" && payload.message.status !== "streaming" && pendingExternalRequest ? null : state.pendingExternalRequest,
      voiceAssistantDraft: payload.message.role === "assistant" ? payload.message.content : state.voiceAssistantDraft,
      voiceSessionPhase:
        state.voiceSessionActive && payload.message.role === "assistant"
          ? speechQueued
            ? "assistant-speaking"
            : payload.message.status === "streaming"
              ? "processing"
              : state.voiceSessionPhase === "review"
                ? state.voiceSessionPhase
                : "listening"
          : state.voiceSessionPhase,
      lastSpokenMessageId:
        shouldVoiceSpeak && payload.message.status === "completed" ? payload.message.id : state.lastSpokenMessageId,
      voiceTelemetry,
      notice:
        payload.message.role === "assistant" && payload.message.status === "completed" && pendingExternalRequest
          ? `Email draft ready for ${pendingExternalRequest.recipientDestination}. Say "yes, send it" or tap Send Email.`
          : payload.message.role === "assistant" &&
              pendingExternalRequest &&
              (payload.message.status === "failed" || payload.message.status === "interrupted")
            ? "The assistant reply was interrupted, so Adam Connect did not prepare the email draft."
            : state.notice
    };
  });

  if (preparedExternalDraft && pendingExternalRequest && get().voiceSessionActive) {
    assistantSpeech.queuePrompt(buildExternalDraftConfirmationPrompt(pendingExternalRequest, preparedExternalDraft));
  }
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
    if (get().voiceSessionActive && !voiceInterruptRequested) {
      voiceInterruptRequested = true;
      assistantSpeech.stop();
      set((state) => ({
        notice: "Codex is still busy, so Adam Connect is stopping the current run before it sends your new voice turn.",
        error: null,
        view: "chat",
        voiceSessionPhase: state.voiceSessionActive ? "interrupted" : state.voiceSessionPhase
      }));
      requestVoiceInterrupt(get, set).catch(() => undefined);
      return;
    }

    set((state) => ({
      notice: "Voice captured. Codex is still busy, so your transcript is waiting in the composer until this run finishes or you tap Stop.",
      error: null,
      view: "chat",
      voiceSessionPhase: state.voiceSessionActive ? "processing" : state.voiceSessionPhase
    }));
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

function isVoiceAssistantActive(get: () => AppState): boolean {
  const state = get();
  const targetSession = findManualStopTargetSession(state.selectedSessionId, state.sessions);
  return Boolean(state.voiceAssistantDraft || state.voiceSessionPhase === "assistant-speaking" || isSessionBusy(targetSession));
}

async function requestVoiceInterrupt(
  get: () => AppState,
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
): Promise<void> {
  const token = get().token;
  const baseUrl = get().baseUrl;
  const targetSession = findManualStopTargetSession(get().selectedSessionId, get().sessions);

  if (!token || !baseUrl || !targetSession) {
    return;
  }

  try {
    const stoppedSession = await api.stopSession(token, baseUrl, targetSession.id);
    set((state) => ({
      sessions: sortSessionsForDisplay([stoppedSession, ...state.sessions.filter((item) => item.id !== stoppedSession.id)]),
      notice: isSessionBusy(targetSession)
        ? "Stopping the current reply so your new turn can continue."
        : "Checking this chat for a stuck run before your new turn continues.",
      error: null
    }));
  } catch (error) {
    set({
      error: error instanceof Error ? error.message : "Could not interrupt the current reply.",
      voiceSessionPhase: "error",
      voiceSessionActive: false,
      listening: false
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

  set((state) => ({
    notice: null,
    error: message || fallbackMessage,
    voiceSessionPhase: state.voiceSessionActive ? "error" : state.voiceSessionPhase
  }));
}

async function enterRepairMode(
  set: (partial: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void,
  get: () => AppState,
  message: string
): Promise<void> {
  clearPendingVoiceTranscript();
  disconnectSocket();
  voice.stopStreamingSession();
  assistantSpeech.reset();
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
    voiceSessionActive: false,
    voiceSessionPhase: "idle",
    liveTranscript: "",
    voiceAudioLevel: -2,
    voiceAssistantDraft: null,
    voiceTelemetry: defaultVoiceTelemetry(),
    lastSpokenMessageId: null,
    externalDraft: null,
    pendingExternalRequest: null,
    notice: "Saved desktop settings were kept so you can repair this link quickly.",
    error: message,
    view: "host"
  });
  voiceInterruptRequested = false;
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
