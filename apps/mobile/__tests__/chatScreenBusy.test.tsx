import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { ChatScreen } from "../src/app/screens";
import type { AppState } from "../src/store/appStore";

const baseStore = {
  booting: false,
  refreshing: false,
  sendingMessage: false,
  realtimeConnected: true,
  view: "chat",
  baseUrl: "http://127.0.0.1:43111",
  deviceName: "Adam's Phone",
  pairingCode: "",
  token: "device-token",
  currentDeviceId: "device-1",
  hostStatus: {
    host: {
      hostName: "Desktop host",
      isOnline: true,
      approvedRoots: ["/tmp/workspace"]
    },
    auth: {
      status: "logged_in",
      detail: "Codex ready"
    }
  },
  devices: [],
  sessions: [
    {
      id: "session-1",
      hostId: "host-1",
      deviceId: "device-1",
      title: "Operator",
      kind: "operator",
      pinned: false,
      archived: false,
      rootPath: "/tmp/workspace",
      threadId: null,
      status: "running",
      activeTurnId: "turn-1",
      stopRequested: false,
      lastError: null,
      lastPreview: null,
      lastActivityAt: "2026-04-12T10:00:00.000Z",
      createdAt: "2026-04-12T10:00:00.000Z",
      updatedAt: "2026-04-12T10:00:00.000Z"
    }
  ],
  selectedSessionId: "session-1",
  messagesBySession: {},
  composer: "check the repo status",
  composerInputMode: "voice",
  newSessionRootPath: "/tmp/workspace",
  newSessionTitle: "",
  projectIntent: "",
  projectInstructions: "",
  projectOutputType: "implementation plan",
  projectTemplateId: "greenfield",
  responseStyle: "natural",
  renameDraftBySession: {},
  autoSpeak: false,
  autoSendVoice: true,
  voiceAvailable: true,
  pushAvailable: false,
  pushSyncing: false,
  listening: false,
  voiceSessionActive: false,
  voiceSessionPhase: "idle",
  liveTranscript: "",
  voiceAudioLevel: -2,
  voiceAssistantDraft: null,
  voiceTelemetry: {
    turnsStarted: 0,
    turnsCompleted: 0,
    interruptions: 0,
    reconnects: 0,
    lastHeardAt: null,
    lastAssistantStartedAt: null,
    lastRoundTripMs: null
  },
  lastSpokenMessageId: null,
  notice: null,
  error: null,
  bootstrap: jest.fn(async () => undefined),
  connectPairing: jest.fn(async () => undefined),
  disconnect: jest.fn(async () => undefined),
  refresh: jest.fn(async () => undefined),
  reconnectRealtime: jest.fn(async () => undefined),
  selectSession: jest.fn(async () => undefined),
  createProjectSession: jest.fn(async () => undefined),
  renameSession: jest.fn(async () => undefined),
  deleteSession: jest.fn(async () => undefined),
  sendMessage: jest.fn(async () => undefined),
  stopSession: jest.fn(async () => undefined),
  renameCurrentDevice: jest.fn(async () => undefined),
  enablePushNotifications: jest.fn(async () => undefined),
  toggleNotificationPreference: jest.fn(async () => undefined),
  sendDeviceTestNotification: jest.fn(async () => undefined),
  revokeDevice: jest.fn(async () => undefined),
  toggleAutoSpeak: jest.fn(async () => undefined),
  toggleAutoSendVoice: jest.fn(async () => undefined),
  testAssistantVoice: jest.fn(async () => undefined),
  toggleListening: jest.fn(async () => undefined),
  setResponseStyle: jest.fn(async () => undefined),
  setRenameDraft: jest.fn(),
  setField: jest.fn(),
  setView: jest.fn()
} as unknown as AppState;

describe("ChatScreen busy send state", () => {
  test("disables Send while the target session is busy", async () => {
    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <ChatScreen store={baseStore} onRefresh={() => undefined} keyboardInset={0} composerBottomPadding={12} />
      );
    });

    const sendButton = tree!.root.findByProps({ testID: "chat-send-button" });

    expect(sendButton.props.disabled).toBe(true);
  });

  test("keeps Stop enabled when another busy chat is the actual target", async () => {
    const mismatchedStore = {
      ...baseStore,
      sessions: [
        {
          ...baseStore.sessions[0],
          id: "session-1",
          title: "Operator",
          status: "running"
        },
        {
          ...baseStore.sessions[0],
          id: "session-2",
          title: "Notes",
          status: "idle"
        }
      ],
      selectedSessionId: "session-2"
    } as AppState;

    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <ChatScreen store={mismatchedStore} onRefresh={() => undefined} keyboardInset={0} composerBottomPadding={12} />
      );
    });

    const stopButton = tree!.root.findByProps({ testID: "chat-stop-button" });

    expect(stopButton.props.disabled).toBe(false);
  });

  test("keeps Stop available as a recovery action even when the selected chat is idle", async () => {
    const idleStore = {
      ...baseStore,
      sessions: [
        {
          ...baseStore.sessions[0],
          id: "session-1",
          title: "Operator",
          status: "idle",
          activeTurnId: null
        }
      ],
      selectedSessionId: "session-1"
    } as AppState;

    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(
        <ChatScreen store={idleStore} onRefresh={() => undefined} keyboardInset={0} composerBottomPadding={12} />
      );
    });

    const stopButton = tree!.root.findByProps({ testID: "chat-stop-button" });

    expect(stopButton.props.disabled).toBe(false);
  });
});
