import React, { useEffect, useState } from "react";
import { Keyboard, Platform, Pressable, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Banner, StatusChip } from "./components";
import { styles } from "./mobileStyles";
import { ChatScreen, HostScreen, PairingScreen, SessionsScreen } from "./screens";
import { useAppStore } from "../store/appStore";

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
        <PairingScreen store={store} keyboardHeight={keyboardHeight} insetBottom={insets.bottom} />
      </SafeAreaView>
    );
  }

  const keyboardInset = store.view === "sessions" || store.view === "chat" ? keyboardHeight : 0;
  const screenBottomPadding = Math.max(insets.bottom, 16) + keyboardInset + 12;
  const composerBottomPadding = Math.max(insets.bottom, 12);

  const handleRefresh = () => {
    store.refresh().catch((error) => console.warn(error));
  };

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
          <StatusChip label={store.hostStatus?.host.isOnline ? "Host online" : "Host offline"} tone={store.hostStatus?.host.isOnline ? "teal" : "orange"} />
          <StatusChip label={humanizeCodexState(store.hostStatus?.auth.status ?? "logged_out")} tone={store.hostStatus?.auth.status === "logged_in" ? "teal" : "orange"} />
          <StatusChip label={store.realtimeConnected ? "Live sync on" : "Live sync reconnecting"} tone={store.realtimeConnected ? "teal" : "orange"} />
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
        />
      ) : null}
    </SafeAreaView>
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
