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
  const muteLabel = store.voiceMuted ? "Unmute" : "Mute";
  const voiceStatus = humanizeVoiceStatus(store);
  const hostStatusLabel = store.hostStatus?.host.isOnline ? "Host online" : "Host offline";
  const codexStatusLabel = humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out");
  const realtimeStatusLabel = store.realtimeConnected ? "Live sync on" : "Reconnecting";
  const primarySubtitle =
    store.view === "chat"
      ? "Talk to Freedom from the same operator system you use on desktop."
      : store.view === "sessions"
        ? "Build new work, launch structured chats, and keep active projects moving."
        : "Connection, voice, and device controls for the Freedom companion.";

  if (store.booting) {
    return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>{FREEDOM_RUNTIME_NAME}</Text>
          <Text style={styles.heroTitle}>{FREEDOM_PRODUCT_NAME}, one scan from your phone.</Text>
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
      <View style={styles.shellHeaderCard}>
        <View style={styles.shellHeaderTop}>
          <View style={styles.shellBrandCluster}>
            <View style={styles.shellBrandMark}>
              <Text style={styles.shellBrandMarkLabel}>OWL</Text>
            </View>
            <View style={styles.shellBrandCopy}>
              <Text style={styles.eyebrow}>{FREEDOM_RUNTIME_NAME}</Text>
              <Text style={styles.shellBrandTitle}>{FREEDOM_PRODUCT_NAME}</Text>
              <Text style={styles.shellBrandSubtitle}>{primarySubtitle}</Text>
            </View>
          </View>
          <View style={styles.shellHeaderActions}>
            <Pressable style={[styles.iconButton, store.refreshing ? styles.disabledButton : null]} onPress={handleRefresh} disabled={store.refreshing}>
              <Text style={styles.iconButtonLabel}>↻</Text>
            </Pressable>
            <Pressable
              style={[styles.iconButton, !store.voiceAvailable ? styles.warningIconButton : null]}
              onPress={handleTalkPress}
            >
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
            <Pressable
              style={styles.iconButton}
              onPress={() => {
                store.disconnect().catch((error) => console.warn(error));
              }}
            >
              <Text style={styles.iconButtonLabel}>Exit</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.statusRow}>
          <StatusChip label={hostStatusLabel} tone={store.hostStatus?.host.isOnline ? "teal" : "orange"} />
          <StatusChip label={codexStatusLabel} tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"} />
          <StatusChip label={realtimeStatusLabel} tone={store.realtimeConnected ? "teal" : "orange"} />
        </View>

        <View style={styles.nav}>
          {(["host", "sessions", "chat"] as const).map((view) => (
            <Pressable
              key={view}
              style={[styles.navButton, store.view === view ? styles.navButtonActive : null]}
              onPress={() => handleNavPress(view)}
            >
              <Text style={[styles.navLabel, store.view === view ? styles.navLabelActive : null]}>{labelForView(view)}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.topPanel}>
        <Text style={styles.panelLead}>
          {store.hostStatus?.host.hostName ?? "Desktop host"} · {voiceStatus}
        </Text>
        <View style={styles.topActions}>
          <Pressable
            style={[styles.secondaryButton, styles.topActionButton, store.refreshing ? styles.disabledButton : null]}
            onPress={handleRefresh}
            disabled={store.refreshing}
          >
            <Text style={styles.secondaryLabel}>{store.refreshing ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryButton, styles.topActionButton]}
            onPress={() => store.reconnectRealtime().catch((error) => console.warn(error))}
          >
            <Text style={styles.secondaryLabel}>Reconnect</Text>
          </Pressable>
        </View>
      </View>

      {store.notice ? <Banner text={store.notice} tone="info" /> : null}
      {store.error ? <Banner text={store.error} tone="error" /> : null}

      {store.view === "host" ? <HostScreen store={store} onRefresh={handleRefresh} insetBottom={insets.bottom} /> : null}
      {store.view === "sessions" ? <SessionsScreen store={store} onRefresh={handleRefresh} bottomPadding={screenBottomPadding} /> : null}
      {store.view === "chat" ? (
        <ChatScreen
          store={store}
          onRefresh={handleRefresh}
          keyboardInset={keyboardInset}
          composerBottomPadding={composerBottomPadding}
          manualToolsVisible
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
