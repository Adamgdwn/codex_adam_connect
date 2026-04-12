import * as vscode from "vscode";
import { DesktopHostRuntime } from "../host/runtime.js";

const runtime = new DesktopHostRuntime();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand("adamConnect.showHostStatus", async () => {
      const state = await runtime.getLocalState();
      void vscode.window.showInformationMessage(
        `Host: ${state.hostId ?? "not registered"} | Pairing code: ${state.pairingCode ?? "not available"} | Codex: ${state.codexAuthStatus ?? "unknown"} | Tailscale URL: ${state.tailscaleSuggestedUrl ?? "not available"}`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("adamConnect.copyPairingCode", async () => {
      const state = await runtime.getLocalState();
      if (!state.pairingCode) {
        void vscode.window.showWarningMessage("Pairing code is not available. Start the desktop host first.");
        return;
      }
      await vscode.env.clipboard.writeText(state.pairingCode);
      void vscode.window.showInformationMessage("Pairing code copied.");
    })
  );
}

export function deactivate(): void {
  runtime.stop();
}
