import React, { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from "react-native";
import type { AppState } from "../store/appStore";
import { isOperatorSession } from "../utils/operatorConsole";
import { Banner, LabeledInput, MessageBubble, StatusChip } from "./components";
import { styles } from "./mobileStyles";

export function PairingScreen(props: {
  store: AppState;
  keyboardHeight: number;
  insetBottom: number;
}): React.JSX.Element {
  const { store, keyboardHeight, insetBottom } = props;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insetBottom, 16) + keyboardHeight + 12 }]}
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

      {store.notice ? <Banner text={store.notice} tone="info" /> : null}
      {store.error ? <Banner text={store.error} tone="error" /> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Connect</Text>
        <LabeledInput label="Desktop URL" value={store.baseUrl} onChange={(value) => store.setField("baseUrl", value)} />
        {store.baseUrl ? <Text style={styles.supportingText}>Desktop URL is pre-filled for this host.</Text> : null}
        <LabeledInput label="Device Name" value={store.deviceName} onChange={(value) => store.setField("deviceName", value)} />
        <LabeledInput
          label="Pairing Code"
          value={store.pairingCode}
          onChange={(value) => store.setField("pairingCode", value)}
          autoCapitalize="characters"
        />
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            store.connectPairing().catch((error) => console.warn(error));
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
    </ScrollView>
  );
}

export function HostScreen(props: {
  store: AppState;
  onRefresh(): void;
  insetBottom: number;
}): React.JSX.Element {
  const { store, onRefresh, insetBottom } = props;

  return (
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insetBottom, 16) + 16 }]}
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" />}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
    >
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Host Status</Text>
        <View style={styles.statusRow}>
          <StatusChip label={store.hostStatus?.host.isOnline ? "Desktop online" : "Desktop offline"} tone={store.hostStatus?.host.isOnline ? "teal" : "orange"} />
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
          Installed: {store.hostStatus?.tailscale.installed ? "yes" : "no"} | Connected: {store.hostStatus?.tailscale.connected ? "yes" : "no"}
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
          <Switch value={store.autoSpeak} onValueChange={() => store.toggleAutoSpeak().catch((error) => console.warn(error))} />
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.metric}>Auto-send voice turns</Text>
          <Switch value={store.autoSendVoice} onValueChange={() => store.toggleAutoSendVoice().catch((error) => console.warn(error))} />
        </View>
      </View>

      <Pressable style={styles.secondaryButton} onPress={onRefresh}>
        <Text style={styles.secondaryLabel}>Refresh Host</Text>
      </Pressable>
    </ScrollView>
  );
}

export function SessionsScreen(props: {
  store: AppState;
  onRefresh(): void;
  bottomPadding: number;
}): React.JSX.Element {
  const { store, onRefresh, bottomPadding } = props;

  return (
    <ScrollView
      style={styles.screenContent}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" />}
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
        <Pressable style={styles.primaryButton} onPress={() => store.createSession().catch((error) => console.warn(error))}>
          <Text style={styles.primaryLabel}>Start Chat</Text>
        </Pressable>
      </View>

      {store.sessions.length ? (
        store.sessions.map((item) => (
          <View key={item.id} style={[styles.card, styles.sessionCard]}>
            {isOperatorSession(item) ? <Text style={styles.operatorBadge}>Default Operator</Text> : null}
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <Text style={styles.rootPath}>{item.rootPath}</Text>
            <Text style={styles.metric}>
              Status: {item.status}
              {item.lastError ? ` | ${item.lastError}` : ""}
            </Text>
            <LabeledInput
              label="Rename Chat"
              value={store.renameDraftBySession[item.id] ?? item.title}
              onChange={(value) => store.setRenameDraft(item.id, value)}
              autoCapitalize="sentences"
            />
            <View style={[styles.actions, styles.chatActions]}>
              <Pressable style={[styles.secondaryButton, styles.chatActionButton]} onPress={() => store.renameSession(item.id).catch((error) => console.warn(error))}>
                <Text style={styles.secondaryLabel}>Rename</Text>
              </Pressable>
              <Pressable style={[styles.primaryButton, styles.chatActionButton]} onPress={() => store.selectSession(item.id).catch((error) => console.warn(error))}>
                <Text style={styles.primaryLabel}>Open Chat</Text>
              </Pressable>
              <Pressable
                style={[styles.secondaryButton, styles.chatActionButton, styles.dangerButton]}
                onPress={() => store.deleteSession(item.id).catch((error) => console.warn(error))}
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
  );
}

export function ChatScreen(props: {
  store: AppState;
  onRefresh(): void;
  keyboardInset: number;
  composerBottomPadding: number;
}): React.JSX.Element {
  const { store, onRefresh, keyboardInset, composerBottomPadding } = props;
  const selectedSession = store.sessions.find((item) => item.id === store.selectedSessionId) ?? null;
  const hasSelectedSession = Boolean(store.selectedSessionId);
  const hasFallbackSession = store.sessions.length > 0;
  const canCreateFromApprovedRoot = Boolean(store.newSessionRootPath || store.hostStatus?.host.approvedRoots[0]);
  const canSend = Boolean((hasSelectedSession || hasFallbackSession || canCreateFromApprovedRoot) && store.composer.trim().length > 0);
  const messages = store.selectedSessionId ? store.messagesBySession[store.selectedSessionId] ?? [] : [];
  const busy = selectedSession ? selectedSession.status === "queued" || selectedSession.status === "running" : false;
  const scrollRef = useRef<ScrollView | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (!stickToBottom) {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length, selectedSession?.id, stickToBottom]);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.screenContent}
      contentContainerStyle={[styles.chatScrollContent, { paddingBottom: composerBottomPadding + keyboardInset + 20 }]}
      refreshControl={<RefreshControl refreshing={store.refreshing} onRefresh={onRefresh} tintColor="#0f766e" />}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      onScroll={(event) => {
        const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
        const distanceFromBottom = contentSize.height - (layoutMeasurement.height + contentOffset.y);
        setStickToBottom(distanceFromBottom < 140);
      }}
      scrollEventThrottle={16}
    >
      <View style={[styles.card, styles.chatSummaryCard]}>
        {selectedSession && isOperatorSession(selectedSession) ? <Text style={styles.operatorBadge}>Default Operator</Text> : null}
        <Text style={styles.sectionTitle}>{selectedSession?.title ?? "No chat selected"}</Text>
        <Text style={styles.metric} numberOfLines={3}>
          {selectedSession?.rootPath ??
            (hasFallbackSession
              ? "Send will resume your latest chat if you do not manually pick one first."
              : canCreateFromApprovedRoot
                ? "Send will start your first chat automatically using the default approved root."
                : "Choose or start a chat from the Chats tab first.")}
        </Text>
        <View style={styles.statusRow}>
          <StatusChip label={selectedSession ? `Status: ${selectedSession.status}` : "Waiting for a chat"} tone={selectedSession?.status === "error" ? "orange" : "teal"} />
        </View>
        {selectedSession?.lastError ? <Text style={styles.supportingText}>{selectedSession.lastError}</Text> : null}
        {!hasSelectedSession && hasFallbackSession ? (
          <Pressable style={styles.secondaryButton} onPress={() => store.selectSession(store.sessions[0].id).catch((error) => console.warn(error))}>
            <Text style={styles.secondaryLabel}>Resume Latest Chat</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.messages}>
        {messages.length > 0 ? messages.map((item) => <MessageBubble key={item.id} message={item} />) : <Text style={styles.metric}>Open a chat to see message history.</Text>}
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
            onPress={() => store.toggleListening().catch((error) => console.warn(error))}
          >
            <Text style={[styles.secondaryLabel, !store.voiceAvailable ? styles.warningButtonLabel : null]}>
              {store.listening ? "Stop Mic" : store.autoSendVoice ? "Talk To Codex" : "Push To Talk"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, styles.chatActionButton, !busy ? styles.disabledButton : null]}
            onPress={() => store.stopSession().catch((error) => console.warn(error))}
            disabled={!busy}
          >
            <Text style={styles.secondaryLabel}>Stop</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, styles.chatActionButton, !canSend ? styles.disabledButton : null]}
            onPress={() => store.sendMessage().catch((error) => console.warn(error))}
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
        {store.autoSendVoice ? <Text style={styles.supportingText}>Voice turns send automatically after transcription when Codex is ready.</Text> : null}
      </View>
    </ScrollView>
  );
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
