import React, { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FREEDOM_PRODUCT_NAME, FREEDOM_RUNTIME_NAME } from "@adam-connect/shared";
import { Banner, StatusChip } from "./components";
import { styles } from "./mobileStyles";
import { ChatScreen, HostScreen, PairingScreen, SessionsScreen } from "./screens";
import type { AppState } from "../store/appStore";
import { useAppStore } from "../store/appStore";
import { humanizeVoiceSessionPhase } from "../services/voice/voiceSessionMachine";

export function AppShell(): React.JSX.Element {
  const store = useAppStore();
  const bootstrap = useAppStore((state) => state.bootstrap);
  const setField = useAppStore((state) => state.setField);
  const selectSession = useAppStore((state) => state.selectSession);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [controlsExpanded, setControlsExpanded] = useState(store.view === "host");
  const insets = useSafeAreaInsets();

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

  const keyboardInset = store.view === "sessions" || store.view === "chat" ? keyboardHeight : 0;
  const screenBottomPadding = Math.max(insets.bottom, 16) + keyboardInset + 12;
  const composerBottomPadding = Math.max(insets.bottom, 8);

  const handleRefresh = () => {
    store.refresh().catch((error) => console.warn(error));
  };
  const refreshLabel = store.refreshing ? "Refreshing..." : "Refresh";
  const talkLabel = store.voiceSessionActive ? "End Voice" : "Start Voice";
  const muteLabel = store.voiceMuted ? "Unmute" : "Mute";
  const controlsLabel = controlsExpanded ? "Hide Controls" : "Show Controls";
  const voiceStatus = humanizeVoiceStatus(store);
  const chatHeaderSession = store.sessions.find((item) => item.id === store.selectedSessionId) ?? store.sessions[0] ?? null;
  const isChatView = store.view === "chat";
  const isSessionsView = store.view === "sessions";
  const isCompactChromeView = isChatView || isSessionsView;
  const compactTitle = isChatView ? chatHeaderSession?.title ?? "Talk" : "Build";
  const compactSubtitle = isChatView
    ? `${humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")} · ${store.realtimeConnected ? "Live sync on" : "Reconnecting"}`
    : `${store.sessions.length} saved · ${store.realtimeConnected ? "Live sync on" : "Reconnecting"}`;

  useEffect(() => {
    if (isCompactChromeView) {
      setControlsExpanded(false);
    }
  }, [isCompactChromeView]);

  if (store.booting) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>{FREEDOM_RUNTIME_NAME}</Text>
          <Text style={styles.heroTitle}>Desktop-grade {FREEDOM_PRODUCT_NAME}, one scan from your phone.</Text>
          <Text style={styles.heroBody}>Loading paired device state and restoring your phone link…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!store.token) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <PairingScreen store={store} keyboardHeight={keyboardHeight} insetBottom={insets.bottom} />
      </SafeAreaView>
    );
  }

  const handleNavPress = (view: "host" | "sessions" | "chat") => {
    if (view !== "chat") {
      store.setView(view);
      return;
    }

    const targetSessionId = store.selectedSessionId ?? store.sessions[0]?.id;
    if (targetSessionId) {
      store.selectSession(targetSessionId).catch((error) => console.warn(error));
      return;
    }

    store.setView("chat");
  };

  const handleTalkPress = () => {
    if (store.view !== "chat") {
      store.setView("chat");
    }
    store.toggleListening().catch((error) => console.warn(error));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
      {isCompactChromeView ? (
        <View style={[styles.header, styles.chatAppHeader]}>
          <View style={styles.chatAppHeaderCopy}>
            <Text style={styles.chatAppHeaderTitle}>{compactTitle}</Text>
            <Text style={styles.chatAppHeaderSubtitle}>{compactSubtitle}</Text>
          </View>
          <View style={styles.chatAppHeaderActions}>
            <Pressable style={[styles.iconButton, store.refreshing ? styles.disabledButton : null]} onPress={handleRefresh} disabled={store.refreshing}>
              <Text style={styles.iconButtonLabel}>↻</Text>
            </Pressable>
            <Pressable style={[styles.iconButton, !store.voiceAvailable ? styles.warningIconButton : null]} onPress={handleTalkPress}>
              <Text style={[styles.iconButtonLabel, !store.voiceAvailable ? styles.warningButtonLabel : null]}>
                {store.voiceSessionActive ? "Stop" : "Voice"}
              </Text>
            </Pressable>
            {store.voiceSessionActive ? (
              <Pressable
                style={[styles.iconButton, store.voiceMuted ? styles.warningIconButton : null]}
                onPress={() => store.toggleVoiceMute().catch((error) => console.warn(error))}
              >
                <Text style={[styles.iconButtonLabel, store.voiceMuted ? styles.warningButtonLabel : null]}>{muteLabel}</Text>
              </Pressable>
            ) : null}
            <Pressable testID="controls-toggle" style={styles.iconButton} onPress={() => setControlsExpanded((value) => !value)}>
              <Text style={styles.iconButtonLabel}>⚙</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>Private Companion Link</Text>
            <Text style={styles.brand}>{FREEDOM_PRODUCT_NAME}</Text>
            <Text style={styles.subtitle}>{store.hostStatus?.host.hostName ?? "Desktop host"}</Text>
            <View style={styles.headerMetaRow}>
              <Pressable
                testID="controls-toggle"
                style={[styles.secondaryButton, styles.headerMenuButton]}
                onPress={() => setControlsExpanded((value) => !value)}
              >
                <Text style={styles.secondaryLabel}>{controlsLabel}</Text>
              </Pressable>
              <Text style={styles.headerStatusText}>
                {humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")} · {store.realtimeConnected ? "Live sync on" : "Live sync reconnecting"}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              style={[styles.secondaryButton, styles.headerActionButton, !store.voiceAvailable ? styles.warningButton : null]}
              onPress={handleTalkPress}
            >
              <Text style={[styles.secondaryLabel, !store.voiceAvailable ? styles.warningButtonLabel : null]}>{talkLabel}</Text>
            </Pressable>
            {store.voiceSessionActive ? (
              <Pressable
                style={[styles.secondaryButton, styles.headerActionButton, store.voiceMuted ? styles.warningButton : null]}
                onPress={() => store.toggleVoiceMute().catch((error) => console.warn(error))}
              >
                <Text style={[styles.secondaryLabel, store.voiceMuted ? styles.warningButtonLabel : null]}>{muteLabel}</Text>
              </Pressable>
            ) : null}
            <Text
              style={[
                styles.voiceStatusText,
                store.voiceAvailable && store.realtimeConnected && store.hostStatus?.auth.status === "logged_in"
                  ? styles.voiceStatusReady
                  : styles.voiceStatusWarning
              ]}
            >
              {voiceStatus}
            </Text>
            <Pressable
              style={styles.disconnectButton}
              onPress={() => {
                store.disconnect().catch((error) => console.warn(error));
              }}
            >
              <Text style={styles.disconnectLabel}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      )}

      {controlsExpanded ? (
        <View style={styles.topPanel}>
          <View style={styles.statusRow}>
            <StatusChip label={store.hostStatus?.host.isOnline ? "Host online" : "Host offline"} tone={store.hostStatus?.host.isOnline ? "teal" : "orange"} />
            <StatusChip label={humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")} tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"} />
            <StatusChip label={store.realtimeConnected ? "Live sync on" : "Live sync reconnecting"} tone={store.realtimeConnected ? "teal" : "orange"} />
          </View>
          <View style={styles.nav}>
            {(["host", "sessions", "chat"] as const).map((view) => (
              <Pressable key={view} style={[styles.navButton, store.view === view ? styles.navButtonActive : null]} onPress={() => handleNavPress(view)}>
                <Text style={[styles.navLabel, store.view === view ? styles.navLabelActive : null]}>{labelForView(view)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.topActions}>
            <Pressable
              style={[styles.secondaryButton, styles.topActionButton, store.refreshing ? styles.disabledButton : null]}
              onPress={handleRefresh}
              disabled={store.refreshing}
            >
              <Text style={styles.secondaryLabel}>{refreshLabel}</Text>
            </Pressable>
            <Pressable
              style={styles.disconnectButton}
              onPress={() => {
                store.disconnect().catch((error) => console.warn(error));
              }}
            >
              <Text style={styles.disconnectLabel}>Disconnect</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {store.notice ? <Banner text={store.notice} tone="info" /> : null}
      {store.error ? <Banner text={store.error} tone="error" /> : null}

      {store.view === "host" ? <HostScreen store={store} onRefresh={handleRefresh} bottomPadding={Math.max(insets.bottom, 16) + 16} /> : null}
      {store.view === "sessions" ? <SessionsScreen store={store} onRefresh={handleRefresh} bottomPadding={screenBottomPadding} /> : null}
      {store.view === "chat" ? (
        <ChatScreen
          store={store}
          onRefresh={handleRefresh}
          keyboardInset={keyboardInset}
          composerBottomPadding={composerBottomPadding}
          manualToolsVisible={controlsExpanded}
        />
      ) : null}
    </SafeAreaView>
  );
}

function labelForView(view: "host" | "sessions" | "chat"): string {
  if (view === "host") {
    return "Overview";
  }
  if (view === "sessions") {
    return "Build";
  }
  return "Talk";
}

function humanizeCodexState(status: "logged_in" | "logged_out" | "error"): string {
  if (status === "logged_in") {
    return "Freedom ready";
  }
  if (status === "error") {
    return "Freedom needs attention";
  }
  return "Freedom login required";
}

function humanizeVoiceStatus(store: AppState): string {
  if (!store.voiceAvailable) {
    return "Voice unavailable on this phone";
  }
  if (store.voiceSessionActive) {
    if (store.voiceMuted) {
      return "Microphone muted";
    }
    return humanizeVoiceSessionPhase(store.voiceSessionPhase);
  }
  if (!store.realtimeConnected) {
    return "Desktop reconnecting";
  }
  if (!store.hostStatus?.host.isOnline) {
    return "Desktop offline";
  }
  if (store.hostStatus?.auth.status !== "logged_in") {
    return "Freedom needs login";
  }
  return "Ready for voice";
}
