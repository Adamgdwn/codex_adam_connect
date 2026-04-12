import React, { useEffect } from "react";
import {
  FlatList,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View
} from "react-native";
import { useAppStore } from "../store/appStore";

export function AppShell(): React.JSX.Element {
  const store = useAppStore();
  const bootstrap = useAppStore((state) => state.bootstrap);
  const setField = useAppStore((state) => state.setField);

  useEffect(() => {
    bootstrap().catch((error) => {
      setField("composer", "");
      console.warn(error);
    });
  }, [bootstrap, setField]);

  if (store.booting) {
    return (
      <SafeAreaView style={styles.root}>
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
      <SafeAreaView style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
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
  const messages = selectedSession ? store.messagesBySession[selectedSession.id] ?? [] : [];
  const busy = selectedSession ? selectedSession.status === "queued" || selectedSession.status === "running" : false;

  return (
    <SafeAreaView style={styles.root}>
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
        </View>
        <View style={styles.nav}>
          {(["host", "sessions", "chat"] as const).map((view) => (
            <Pressable
              key={view}
              style={[styles.navButton, store.view === view ? styles.navButtonActive : null]}
              onPress={() => store.setView(view)}
            >
              <Text style={[styles.navLabel, store.view === view ? styles.navLabelActive : null]}>
                {labelForView(view)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {store.view === "host" && (
        <ScrollView contentContainerStyle={styles.content}>
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
          </View>

          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              store.refresh().catch((error) => console.warn(error));
            }}
          >
            <Text style={styles.secondaryLabel}>Refresh Host</Text>
          </Pressable>
        </ScrollView>
      )}

      {store.view === "sessions" && (
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>New Chat</Text>
            <Text style={styles.supportingText}>Pick one approved workspace and start a persistent Codex thread.</Text>
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

          <FlatList
            data={store.sessions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.card, styles.sessionCard]}
                onPress={() => {
                  store.selectSession(item.id).catch((error) => console.warn(error));
                }}
              >
                <Text style={styles.sectionTitle}>{item.title}</Text>
                <Text style={styles.metric}>{item.rootPath}</Text>
                <Text style={styles.metric}>
                  {item.status}
                  {item.lastError ? ` | ${item.lastError}` : ""}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.metric}>No chats yet. Start one from an approved root.</Text>}
          />
        </View>
      )}

      {store.view === "chat" && (
        <View style={styles.content}>
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{selectedSession?.title ?? "No chat selected"}</Text>
            <Text style={styles.metric}>{selectedSession?.rootPath ?? "Choose a session from Chats."}</Text>
            <View style={styles.statusRow}>
              <StatusChip
                label={selectedSession ? `Status: ${selectedSession.status}` : "Waiting for a chat"}
                tone={selectedSession?.status === "error" ? "orange" : "teal"}
              />
            </View>
          </View>

          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            style={styles.messages}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <View style={[styles.messageBubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
                <Text style={styles.messageRole}>{item.role}</Text>
                <Text style={styles.messageText}>{item.content || item.errorMessage || "..."}</Text>
                <Text style={styles.messageMeta}>{item.status}</Text>
              </View>
            )}
            ListEmptyComponent={<Text style={styles.metric}>Open a chat to see message history.</Text>}
          />

          <View style={styles.card}>
            <TextInput
              value={store.composer}
              onChangeText={(value) => store.setField("composer", value)}
              placeholder="Ask Codex something about this repo..."
              placeholderTextColor="#64748b"
              multiline
              style={styles.composer}
            />
            <View style={styles.actions}>
              <Pressable
                style={[styles.secondaryButton, !store.voiceAvailable ? styles.disabledButton : null]}
                onPress={() => {
                  store.toggleListening().catch((error) => console.warn(error));
                }}
                disabled={!store.voiceAvailable}
              >
                <Text style={styles.secondaryLabel}>{store.listening ? "Stop Mic" : "Push To Talk"}</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, !busy ? styles.disabledButton : null]}
                onPress={() => {
                  store.stopSession().catch((error) => console.warn(error));
                }}
                disabled={!busy}
              >
                <Text style={styles.secondaryLabel}>Stop</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryButton, !selectedSession ? styles.disabledButton : null]}
                onPress={() => {
                  store.sendMessage().catch((error) => console.warn(error));
                }}
                disabled={!selectedSession}
              >
                <Text style={styles.primaryLabel}>Send</Text>
              </Pressable>
            </View>
          </View>
        </View>
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
  messages: { flex: 1 },
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
  actions: { flexDirection: "row", gap: 10 }
});
