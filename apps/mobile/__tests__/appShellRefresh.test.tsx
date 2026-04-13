import React from "react";
import ReactTestRenderer from "react-test-renderer";
import { AppShell } from "../src/app/AppShell";
import { refreshScrollInteractionProps } from "../src/app/screens";

const mockStore = {
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
  sessions: [],
  selectedSessionId: null,
  messagesBySession: {},
  composer: "",
  composerInputMode: "text",
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
  toggleListening: jest.fn(async () => undefined),
  setResponseStyle: jest.fn(async () => undefined),
  setRenameDraft: jest.fn(),
  setField: jest.fn(),
  setView: jest.fn()
};

jest.mock("../src/store/appStore", () => ({
  useAppStore: jest.fn((selector?: (state: typeof mockStore) => unknown) => (selector ? selector(mockStore) : mockStore))
}));

describe("refresh affordances", () => {
  beforeEach(() => {
    mockStore.refreshing = false;
    mockStore.view = "chat";
    mockStore.sendingMessage = false;
    mockStore.voiceAvailable = true;
    mockStore.realtimeConnected = true;
    mockStore.hostStatus.auth.status = "logged_in";
    mockStore.refresh.mockClear();
    mockStore.bootstrap.mockClear();
    mockStore.selectSession.mockClear();
    mockStore.setField.mockClear();
  });

  test("AppShell tucks the shared controls behind a header toggle while staying in chat", async () => {
    let tree: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      tree = ReactTestRenderer.create(<AppShell />);
    });

    let labels = tree!.root.findAll((node) => typeof node.props.children !== "undefined").flatMap((node) => flattenText(node.props.children));

    expect(labels).not.toContain("Refresh");
    expect(labels).toContain("Talk");
    expect(labels).toContain("⚙");
    expect(labels).toContain("Codex ready");
    expect(mockStore.bootstrap).toHaveBeenCalled();

    const controlsToggle = tree!.root.findByProps({ testID: "controls-toggle" });

    await ReactTestRenderer.act(async () => {
      controlsToggle.props.onPress();
    });

    labels = tree!.root.findAll((node) => typeof node.props.children !== "undefined").flatMap((node) => flattenText(node.props.children));

    expect(labels).toContain("Refresh");
    expect(labels).toContain("Disconnect");
  });

  test("shared refresh scroll interaction keeps overscroll enabled", () => {
    expect(refreshScrollInteractionProps.overScrollMode).toBe("always");
    expect(refreshScrollInteractionProps.alwaysBounceVertical).toBe(true);
  });
});

function flattenText(children: React.ReactNode): string[] {
  if (typeof children === "string") {
    return [children];
  }
  if (typeof children === "number") {
    return [String(children)];
  }
  if (Array.isArray(children)) {
    return children.flatMap((child) => flattenText(child));
  }
  return [];
}
