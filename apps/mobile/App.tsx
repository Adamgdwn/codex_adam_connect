import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppShell } from "./src/app/AppShell";
import { FREEDOM_PRODUCT_NAME, FREEDOM_RUNTIME_NAME } from "@adam-connect/shared";

interface MobileErrorBoundaryState {
  hasError: boolean;
}

class MobileErrorBoundary extends React.Component<React.PropsWithChildren, MobileErrorBoundaryState> {
  state: MobileErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): MobileErrorBoundaryState {
    return {
      hasError: true
    };
  }

  componentDidCatch(error: unknown): void {
    console.error("Freedom mobile crashed while rendering.", error);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View
        style={{
          flex: 1,
          paddingHorizontal: 24,
          paddingVertical: 32,
          justifyContent: "center",
          backgroundColor: "#f8fafc"
        }}
      >
        <View
          style={{
            borderRadius: 24,
            padding: 24,
            backgroundColor: "#ffffff",
            borderWidth: 1,
            borderColor: "#cbd5e1",
            gap: 12
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 1.2, color: "#0f766e", textTransform: "uppercase" }}>
            {FREEDOM_RUNTIME_NAME}
          </Text>
          <Text style={{ fontSize: 28, fontWeight: "700", color: "#0f172a" }}>{FREEDOM_PRODUCT_NAME}</Text>
          <Text style={{ fontSize: 16, lineHeight: 24, color: "#334155" }}>
            This phone hit a startup error, but {FREEDOM_RUNTIME_NAME} is still protecting the session instead of closing the app.
          </Text>
          <Text style={{ fontSize: 14, lineHeight: 22, color: "#475569" }}>
            Tap retry first. If it still fails, reinstall the latest APK and we’ll keep tracing the device-specific crash.
          </Text>
          <Pressable
            onPress={this.handleRetry}
            style={{
              marginTop: 8,
              alignSelf: "flex-start",
              borderRadius: 999,
              backgroundColor: "#0f766e",
              paddingHorizontal: 18,
              paddingVertical: 12
            }}
          >
            <Text style={{ color: "#f8fafc", fontWeight: "700" }}>Retry Startup</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <MobileErrorBoundary>
        <AppShell />
      </MobileErrorBoundary>
    </SafeAreaProvider>
  );
}
