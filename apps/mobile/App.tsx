import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppShell } from "./src/app/AppShell";

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <AppShell />
    </SafeAreaProvider>
  );
}
