import React, { useEffect, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppStore } from "../store/appStore";

export function AppShell(): React.JSX.Element {
  const store = useAppStore();
  const bootstrap = useAppStore((state) => state.bootstrap);
  const setField = useAppStore((state) => state.setField);
  const setView = useAppStore((state) => state.setView);
  const selectSession = useAppStore((state) => state.selectSession);
  const renameSession = useAppStore((state) => state.renameSession);
  const deleteSession = useAppStore((state) => state.deleteSession);
  const setRenameDraft = useAppStore((state) => state.setRenameDraft);
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    bootstrap().catch((error) => {
      setField("composer", "");
      console.warn(error);
    });
  }, [bootstrap, setField]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates.height - insets.bottom));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom]);

  const selectedMessageCount = store.selectedSessionId ? (store.messagesBySession[store.selectedSessionId]?.length ?? 0) : 0;

  useEffect(() => {
    if (!store.token || !store.selectedSessionId || selectedMessageCount > 0) {
      return;
    }

    selectSession(store.selectedSessionId).catch((error) => console.warn(error));
  }, [selectSession, selectedMessageCount, store.selectedSessionId, store.token]);

  if (store.booting) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>Adam Connect v1</Text>
          <Text style={styles.heroTitle}>Desktop-grade Codex, now one scan from your phone.</Text>
          <Text style={styles.heroBody}>Loading paired device state and restoring your phone link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!store.token) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + keyboardHeight + 12 }]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.heroCard}>
            <Text style={styles.eyebrow}>Pair Over Tailscale</Text>
            <Text style={styles.heroTitle}>Adam Connect</Text>
            <Text style={styles.heroBody}>
              Turn this phone into a private Codex console for your desktop. Pair once, keep API keys off the device,
              and use voice or text from anywhere on your tailnet.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Connect</Text>
            <LabeledInput label="Desktop URL" value={store.baseUrl} onChange={(value) => store.setField("baseUrl", value)} />
            {store.baseUrl ? <Text style={styles.supportingText}>Desktop URL is pre-filled for this host.</Text> : null}
            <LabeledInput
              label="Device Name"
              value={store.deviceName}
              onChange={(value) => store.setField("deviceName", value)}
            />
            <LabeledInput
              label="Pairing Code"
              value={store.pairingCode}
              onChange={(value) => store.setField("pairingCode", value)}
              autoCapitalize="characters"
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                store.connectPairing().catch((error) => {
                  console.warn(error);
                });
              }}
            >
              <Text style={styles.primaryLabel}>Pair Phone</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Need Tailscale?</Text>
            <Text style={styles.supportingText}>
              Adam Connect can help you get started, but it cannot silently enroll devices into your tailnet.
            </Text>
            <Text style={styles.metric}>1. Install Tailscale on this phone and on your desktop.</Text>
            <Text style={styles.metric}>2. Sign both devices into the same Tailscale account.</Text>
            <Text style={styles.metric}>3. Use the desktop Tailscale URL in the Desktop URL field.</Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Linking.openURL("https://tailscale.com/download").catch((error) => console.warn(error));
                }}
              >
                <Text style={styles.secondaryLabel}>Get Tailscale</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Linking.openURL("https://login.tailscale.com/start").catch((error) => console.warn(error));
                }}
              >
                <Text style={styles.secondaryLabel}>Sign In</Text>
              </Pressable>
            </View>
          </View>

          {store.error ? <Text style={styles.error}>{store.error}</Text> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const selectedSession = store.sessions.find((item) => item.id === store.selectedSessionId) ?? null;
  const hasSelectedSession = Boolean(store.selectedSessionId);
  const hasFallbackSession = store.sessions.length > 0;
  const canCreateFromApprovedRoot = Boolean(store.newSessionRootPath || store.hostStatus?.host.approvedRoots[0]);
  const canSend = Boolean((hasSelectedSession || hasFallbackSession || canCreateFromApprovedRoot) && store.composer.trim().length > 0);
  const messages = store.selectedSessionId ? store.messagesBySession[store.selectedSessionId] ?? [] : [];
  const busy = selectedSession ? selectedSession.status === "queued" || selectedSession.status === "running" : false;
  const keyboardInset = store.view === "sessions" || store.view === "chat" ? keyboardHeight : 0;
  const screenBottomPadding = Math.max(insets.bottom, 16) + keyboardInset + 12;
  const composerBottomPadding = Math.max(insets.bottom, 12);
  const handleRefresh = () => {
    store.refresh().catch((error) => console.warn(error));
  };

  const handleNavPress = (view: "host" | "sessions" | "chat") => {
    if (view !== "chat") {
      setView(view);
      return;
    }

    const targetSessionId = store.selectedSessionId ?? store.sessions[0]?.id;
    if (targetSessionId) {
      selectSession(targetSessionId).catch((error) => console.warn(error));
      return;
    }

    setView("chat");
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Private Operator Link</Text>
          <Text style={styles.brand}>Adam Connect</Text>
          <Text style={styles.subtitle}>{store.hostStatus?.host.hostName ?? "Desktop host"}</Text>
        </View>
        <Pressable
          style={styles.disconnectButton}
          onPress={() => {
            store.disconnect().catch((error) => console.warn(error));
          }}
        >
          <Text style={styles.disconnectLabel}>Disconnect</Text>
        </Pressable>
      </View>

      <View style={styles.topPanel}>
        <View style={styles.statusRow}>
          <StatusChip
            label={store.hostStatus?.host.isOnline ? "Host online" : "Host offline"}
            tone={store.hostStatus?.host.isOnline ? "teal" : "orange"}
          />
          <StatusChip
            label={humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")}
            tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"}
          />
          <StatusChip label={store.realtimeConnected ? "Live sync on" : "Live sync reconnecting"} tone={store.realtimeConnected ? "teal" : "orange"} />
        </View>
        <View style={styles.nav}>
          {(["host", "sessions", "chat"] as const).map((view) => (
            <Pressable
              key={view}
              style={[styles.navButton, store.view === view ? styles.navButtonActive : null]}
              onPress={() => handleNavPress(view)}
            >
              <Text style={[styles.navLabel, store.view === view ? styles.navLabelActive : null]}>
                {labelForView(view)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {store.view === "host" && (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}
          refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={handleRefresh} tintColor="#0f766e" />}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Host Status</Text>
            <View style={styles.statusRow}>
              <StatusChip
                label={store.hostStatus?.host.isOnline ? "Desktop online" : "Desktop offline"}
                tone={store.hostStatus?.host.isOnline ? "teal" : "orange"}
              />
              <StatusChip
                label={humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")}
                tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"}
              />
            </View>
            <Text style={styles.supportingText}>{store.hostStatus?.auth.detail ?? "Waiting for desktop heartbeat."}</Text>
            <Text style={styles.metric}>Active chats: {store.hostStatus?.activeSessionCount ?? 0}</Text>
            <Text style={styles.metric}>Paired devices: {store.hostStatus?.pairedDeviceCount ?? 0}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tailscale</Text>
            <Text style={styles.metric}>
              Installed: {store.hostStatus?.tailscale.installed ? "yes" : "no"} | Connected:{" "}
              {store.hostStatus?.tailscale.connected ? "yes" : "no"}
            </Text>
            <Text style={styles.supportingText}>{store.hostStatus?.tailscale.detail ?? "No Tailscale status reported yet."}</Text>
            {store.hostStatus?.tailscale.suggestedUrl ? (
              <Text style={styles.rootPath}>Suggested mobile URL: {store.hostStatus.tailscale.suggestedUrl}</Text>
            ) : null}
            <View style={styles.actions}>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Linking.openURL(store.hostStatus?.tailscale.installUrl ?? "https://tailscale.com/download").catch((error) =>
                    console.warn(error)
                  );
                }}
              >
                <Text style={styles.secondaryLabel}>Install</Text>
              </Pressable>
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  Linking.openURL(store.hostStatus?.tailscale.loginUrl ?? "https://login.tailscale.com/start").catch((error) =>
                    console.warn(error)
                  );
                }}
              >
                <Text style={styles.secondaryLabel}>Sign In</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Approved Roots</Text>
            {(store.hostStatus?.host.approvedRoots ?? []).map((rootPath) => (
              <Text key={rootPath} style={styles.rootPath}>
                {rootPath}
              </Text>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Voice</Text>
            <View style={styles.rowBetween}>
              <Text style={styles.metric}>Voice available</Text>
              <Text style={styles.metric}>{store.voiceAvailable ? "yes" : "no"}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metric}>Auto-read replies</Text>
              <Switch
                value={store.autoSpeak}
                onValueChange={() => {
                  store.toggleAutoSpeak().catch((error) => console.warn(error));
                }}
              />
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.metric}>Auto-send voice turns</Text>
              <Switch
                value={store.autoSendVoice}
                onValueChange={() => {
                  store.toggleAutoSendVoice().catch((error) => console.warn(error));
                }}
              />
            </View>
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={handleRefresh}
          >
            <Text style={styles.secondaryLabel}>Refresh Host</Text>
          </Pressable>
        </ScrollView>
      )}

      {store.view === "sessions" && (
        <ScrollView
          style={styles.screenContent}
          contentContainerStyle={[styles.content, { paddingBottom: screenBottomPadding }]}
          refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={handleRefresh} tintColor="#0f766e" />}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>New Chat</Text>
            <Text style={styles.supportingText}>Pick one approved workspace and start a persistent Codex thread.</Text>
            <Text style={styles.supportingText}>Adam Connect also keeps a default `Operator` chat ready for quick voice turns.</Text>
            <LabeledInput
              label="Chat Name"
              value={store.newSessionTitle}
              onChange={(value) => store.setField("newSessionTitle", value)}
              autoCapitalize="sentences"
            />
            <LabeledInput
              label="Workspace Root"
              value={store.newSessionRootPath}
              onChange={(value) => store.setField("newSessionRootPath", value)}
            />
            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                store.createSession().catch((error) => console.warn(error));
              }}
            >
              <Text style={styles.primaryLabel}>Start Chat</Text>
            </Pressable>
          </View>

          {store.sessions.length ? (
            store.sessions.map((item) => (
              <View key={item.id} style={[styles.card, styles.sessionCard]}>
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Text style={styles.rootPath}>{item.rootPath}</Text>
                <Text style={styles.metric}>
                  Status: {item.status}
                  {item.lastError ? ` | ${item.lastError}` : ""}
                </Text>
                <LabeledInput
                  label="Rename Chat"
                  value={store.renameDraftBySession[item.id] ?? item.title}
                  onChange={(value) => setRenameDraft(item.id, value)}
                  autoCapitalize="sentences"
                />
                <View style={[styles.actions, styles.chatActions]}>
                  <Pressable
                    style={[styles.secondaryButton, styles.chatActionButton]}
                    onPress={() => {
                      renameSession(item.id).catch((error) => console.warn(error));
                    }}
                  >
                    <Text style={styles.secondaryLabel}>Rename</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryButton, styles.chatActionButton]}
                    onPress={() => {
                      selectSession(item.id).catch((error) => console.warn(error));
                    }}
                  >
                    <Text style={styles.primaryLabel}>Open Chat</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.secondaryButton, styles.chatActionButton, styles.dangerButton]}
                    onPress={() => {
                      deleteSession(item.id).catch((error) => console.warn(error));
                    }}
                  >
                    <Text style={[styles.secondaryLabel, styles.dangerButtonLabel]}>Delete Chat</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.metric}>No chats yet. Start one from an approved root.</Text>
          )}
        </ScrollView>
      )}

      {store.view === "chat" && (
        <ScrollView
          style={styles.screenContent}
          contentContainerStyle={[
            styles.chatScrollContent,
            {
              paddingBottom: composerBottomPadding + keyboardInset + 20
            }
          ]}
          refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={handleRefresh} tintColor="#0f766e" />}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        >
          <View style={[styles.card, styles.chatSummaryCard]}>
            <Text style={styles.sectionTitle}>{selectedSession?.title ?? "No chat selected"}</Text>
            <Text style={styles.metric} numberOfLines={2}>
              {selectedSession?.rootPath ??
                (hasFallbackSession
                  ? "Send will resume your latest chat if you do not manually pick one first."
                  : canCreateFromApprovedRoot
                    ? "Send will start your first chat automatically using the default approved root."
                    : "Choose or start a chat from the Chats tab first.")}
            </Text>
            <View style={styles.statusRow}>
              <StatusChip
                label={selectedSession ? `Status: ${selectedSession.status}` : "Waiting for a chat"}
                tone={selectedSession?.status === "error" ? "orange" : "teal"}
              />
            </View>
            {!hasSelectedSession && hasFallbackSession ? (
              <Pressable
                style={styles.secondaryButton}
                onPress={() => {
                  store.selectSession(store.sessions[0].id).catch((error) => console.warn(error));
                }}
              >
                <Text style={styles.secondaryLabel}>Resume Latest Chat</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.messages}>
            {messages.length > 0 ? (
              messages.map((item) => (
                <View key={item.id} style={[styles.messageBubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
                  <Text style={styles.messageRole}>{item.role}</Text>
                  <Text style={styles.messageText}>{item.content || item.errorMessage || "..."}</Text>
                  <Text style={styles.messageMeta}>{item.status}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.metric}>Open a chat to see message history.</Text>
            )}
          </View>

          <View style={[styles.card, styles.chatComposerCard]}>
            <TextInput
              value={store.composer}
              onChangeText={(value) => store.setField("composer", value)}
              placeholder="Ask Codex something about this repo..."
              placeholderTextColor="#64748b"
              multiline
              style={[styles.composer, Platform.OS === "android" ? styles.composerCompact : null]}
            />
            <View style={[styles.actions, styles.chatActions]}>
              <Pressable
                style={[styles.secondaryButton, styles.chatActionButton, !store.voiceAvailable ? styles.warningButton : null]}
                onPress={() => {
                  store.toggleListening().catch((error) => console.warn(error));
                }}
              >
                <Text style={[styles.secondaryLabel, !store.voiceAvailable ? styles.warningButtonLabel : null]}>
                  {store.listening ? "Stop Mic" : store.autoSendVoice ? "Talk To Codex" : "Push To Talk"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.chatActionButton, !busy ? styles.disabledButton : null]}
                onPress={() => {
                  store.stopSession().catch((error) => console.warn(error));
                }}
                disabled={!busy}
              >
                <Text style={styles.secondaryLabel}>Stop</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, styles.chatActionButton, !canSend ? styles.disabledButton : null]}
                onPress={() => {
                  store.sendMessage().catch((error) => console.warn(error));
                }}
                disabled={!canSend}
              >
                <Text style={styles.primaryLabel}>Send</Text>
              </Pressable>
            </View>
            {!hasFallbackSession ? <Text style={styles.supportingText}>Start a chat in `Chats` before sending your first prompt.</Text> : null}
            {!hasFallbackSession && canCreateFromApprovedRoot ? (
              <Text style={styles.supportingText}>If you type or dictate a prompt here, `Send` will create the first chat for you automatically.</Text>
            ) : null}
            {!store.voiceAvailable ? (
              <Text style={styles.supportingText}>
                Voice needs the phone's speech recognition service. Tap the button and the app will explain if Android is missing it.
              </Text>
            ) : null}
            {store.autoSendVoice ? (
              <Text style={styles.supportingText}>Voice turns send automatically after transcription when Codex is ready.</Text>
            ) : null}
          </View>
        </ScrollView>
      )}

      {store.error ? <Text style={styles.error}>{store.error}</Text> : null}
    </SafeAreaView>
  );
}

function StatusChip(props: { label: string; tone: "teal" | "orange" }): React.JSX.Element {
  return (
    <View style={[styles.statusChip, props.tone === "teal" ? styles.statusChipTeal : styles.statusChipOrange]}>
      <Text style={[styles.statusChipLabel, props.tone === "teal" ? styles.statusChipLabelTeal : styles.statusChipLabelOrange]}>
        {props.label}
      </Text>
    </View>
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChange(value: string): void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        style={styles.input}
        value={props.value}
        onChangeText={props.onChange}
        autoCapitalize={props.autoCapitalize ?? "none"}
      />
    </View>
  );
}

function labelForView(view: "host" | "sessions" | "chat"): string {
  if (view === "host") {
    return "Host";
  }
  if (view === "sessions") {
    return "Chats";
  }
  return "Chat";
}

function humanizeCodexState(status: "logged_in" | "logged_out" | "error"): string {
  if (status === "logged_in") {
    return "Codex ready";
  }
  if (status === "error") {
    return "Codex needs attention";
  }
  return "Codex login required";
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f6f2e9", padding: 16 },
  heroCard: {
    backgroundColor: "#0f172a",
    borderRadius: 28,
    padding: 24,
    gap: 12,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8
  },
  header: { gap: 14, marginBottom: 12 },
  topPanel: {
    backgroundColor: "rgba(255,255,255,0.74)",
    borderRadius: 24,
    padding: 14,
    gap: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)"
  },
  eyebrow: { color: "#99f6e4", textTransform: "uppercase", letterSpacing: 1.2, fontWeight: "800", fontSize: 12 },
  heroTitle: { fontSize: 31, lineHeight: 34, fontWeight: "800", color: "#f8fafc" },
  brand: { fontSize: 31, lineHeight: 34, fontWeight: "800", color: "#0f172a" },
  heroBody: { color: "#dbe4f0", lineHeight: 22, fontSize: 15 },
  subtitle: { color: "#475569", marginTop: 2, fontSize: 15 },
  nav: { flexDirection: "row", gap: 8 },
  navButton: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: "#e8ecf2",
    paddingVertical: 12,
    alignItems: "center"
  },
  navButtonActive: { backgroundColor: "#0f172a" },
  navLabel: { color: "#334155", fontWeight: "700" },
  navLabelActive: { color: "#ffffff" },
  content: { gap: 14, paddingBottom: 28, flexGrow: 1 },
  screenContent: { flex: 1, gap: 14, paddingBottom: 12, minHeight: 0 },
  chatScrollContent: { gap: 14, paddingBottom: 20, flexGrow: 1 },
  card: {
    backgroundColor: "rgba(255,255,255,0.82)",
    borderRadius: 24,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.08)"
  },
  sessionCard: { backgroundColor: "rgba(255,255,255,0.9)" },
  sectionTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  supportingText: { color: "#475569", lineHeight: 21 },
  metric: { color: "#334155", lineHeight: 21 },
  rootPath: { color: "#0f172a", fontFamily: "monospace", backgroundColor: "#f8fafc", borderRadius: 14, padding: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  statusChipTeal: { backgroundColor: "#ccfbf1" },
  statusChipOrange: { backgroundColor: "#ffedd5" },
  statusChipLabel: { fontWeight: "800", fontSize: 12 },
  statusChipLabelTeal: { color: "#0f766e" },
  statusChipLabelOrange: { color: "#c2410c" },
  primaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center"
  },
  primaryLabel: { color: "#ffffff", fontWeight: "800" },
  secondaryButton: {
    backgroundColor: "#dbeafe",
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    minHeight: 50,
    justifyContent: "center"
  },
  secondaryLabel: { color: "#1d4ed8", fontWeight: "800" },
  warningButton: { backgroundColor: "#fef3c7" },
  warningButtonLabel: { color: "#92400e" },
  dangerButton: { backgroundColor: "#fee2e2" },
  dangerButtonLabel: { color: "#b91c1c" },
  disabledButton: { opacity: 0.45 },
  disconnectButton: {
    alignSelf: "flex-start",
    backgroundColor: "#ffedd5",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  disconnectLabel: { color: "#c2410c", fontWeight: "800" },
  error: { color: "#b91c1c", fontWeight: "600", marginTop: 8 },
  inputGroup: { gap: 6 },
  inputLabel: { color: "#334155", fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.1)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: "#0f172a",
    backgroundColor: "#fffdf8"
  },
  list: { gap: 12, paddingBottom: 16 },
  chatSummaryCard: { paddingVertical: 14, gap: 8, flexShrink: 1 },
  messages: { gap: 12 },
  chatComposerCard: { marginTop: 4, paddingBottom: 16 },
  messageBubble: {
    borderRadius: 22,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.06)"
  },
  userBubble: { backgroundColor: "#ccfbf1" },
  assistantBubble: { backgroundColor: "rgba(255,255,255,0.9)" },
  messageRole: { fontWeight: "700", color: "#0f172a" },
  messageText: { color: "#334155" },
  messageMeta: { color: "#64748b", fontSize: 12 },
  composer: {
    minHeight: 96,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "rgba(15,23,42,0.1)",
    borderRadius: 18,
    padding: 14,
    color: "#0f172a",
    backgroundColor: "#fffdf8"
  },
  composerCompact: { minHeight: 72, maxHeight: 120 },
  actions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  chatActions: { flexDirection: "column" },
  chatActionButton: { width: "100%" }
});
