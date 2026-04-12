import path from "node:path";
import dotenv from "dotenv";
import { createId } from "@adam-connect/core";
import type { HostWorkMessage } from "@adam-connect/shared";
import { HttpGatewayClient } from "../services/gatewayClient.js";
import { resolveApprovedRoots } from "./approvedRoots.js";
import { CodexBridge } from "./codexBridge.js";
import { HostStateStore } from "./store.js";
import { getTailscaleStatus } from "./tailscale.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

interface ActiveRun {
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  threadId: string;
  turnId: string;
  interrupting: boolean;
}

export class DesktopHostRuntime {
  private readonly gatewayUrl = process.env.DESKTOP_GATEWAY_URL ?? "http://127.0.0.1:43111";
  private readonly gateway = new HttpGatewayClient(this.gatewayUrl);
  private readonly stateStore = new HostStateStore(process.env.DESKTOP_DATA_DIR ?? ".local-data/desktop");
  private readonly codexBridge = new CodexBridge();
  private pollHandle: NodeJS.Timeout | null = null;
  private heartbeatHandle: NodeJS.Timeout | null = null;
  private hostToken: string | null = null;
  private hostId: string | null = null;
  private activeRun: ActiveRun | null = null;
  private ticking = false;

  async start(): Promise<void> {
    const hostName = process.env.DESKTOP_HOST_NAME ?? "Workstation Main";
    const approvedRoots = await resolveApprovedRoots(parseRoots(process.env.DESKTOP_APPROVED_ROOTS));

    await this.codexBridge.start();
    const auth = await this.codexBridge.getAuthState();
    const tailscale = await getTailscaleStatus(Number(new URL(this.gatewayUrl).port || 43111));
    const registration = await this.gateway.registerHost({ hostName, approvedRoots });

    this.hostToken = registration.hostToken;
    this.hostId = registration.host.id;

    await this.stateStore.write({
      hostToken: registration.hostToken,
      hostId: registration.host.id,
      hostName,
      gatewayUrl: this.gatewayUrl,
      pairingCode: registration.pairingCode,
      pairingCodeIssuedAt: registration.host.pairingCodeIssuedAt,
      codexAuthStatus: auth.status,
      codexAuthDetail: auth.detail,
      tailscaleStatus: tailscale.installed ? (tailscale.connected ? "connected" : "not_connected") : "not_installed",
      tailscaleDetail: tailscale.detail,
      tailscaleSuggestedUrl: tailscale.suggestedUrl
    });

    await this.gateway.heartbeat(registration.hostToken, { auth, tailscale });

    this.pollHandle = setInterval(() => {
      void this.tick();
    }, 1000);

    this.heartbeatHandle = setInterval(() => {
      void this.syncHeartbeat();
    }, 5000);

    process.stdout.write(
      [
        "Desktop host ready.",
        `Gateway URL: ${this.gatewayUrl}`,
        `Host ID: ${registration.host.id}`,
        `Pairing code: ${registration.pairingCode}`,
        `Codex auth: ${auth.detail ?? auth.status}`,
        `Tailscale: ${tailscale.detail ?? "unknown"}`,
        `Suggested mobile URL: ${tailscale.suggestedUrl ?? "not available"}`
      ].join("\n") + "\n"
    );

    await this.syncHeartbeat();
    await this.tick();
  }

  async getLocalState() {
    return this.stateStore.read();
  }

  stop(): void {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
    void this.codexBridge.stop();
  }

  private async syncHeartbeat(): Promise<void> {
    if (!this.hostToken) {
      return;
    }
    const auth = await this.codexBridge.getAuthState();
    const tailscale = await getTailscaleStatus(Number(new URL(this.gatewayUrl).port || 43111));
    await this.gateway.heartbeat(this.hostToken, { auth, tailscale });
    const current = await this.stateStore.read();
    await this.stateStore.write({
      ...current,
      codexAuthStatus: auth.status,
      codexAuthDetail: auth.detail,
      tailscaleStatus: tailscale.installed ? (tailscale.connected ? "connected" : "not_connected") : "not_installed",
      tailscaleDetail: tailscale.detail,
      tailscaleSuggestedUrl: tailscale.suggestedUrl
    });
  }

  private async tick(): Promise<void> {
    if (!this.hostToken || this.ticking) {
      return;
    }
    this.ticking = true;

    try {
      if (this.activeRun) {
        const work = await this.gateway.getNextWork(this.hostToken);
        if (
          work?.type === "interrupt" &&
          work.session.id === this.activeRun.sessionId &&
          work.turnId === this.activeRun.turnId &&
          !this.activeRun.interrupting
        ) {
          this.activeRun.interrupting = true;
          await this.codexBridge.interrupt(this.activeRun.threadId, this.activeRun.turnId);
        }
        return;
      }

      const work = await this.gateway.getNextWork(this.hostToken);
      if (work?.type === "message") {
        void this.processMessage(work);
      }
    } finally {
      this.ticking = false;
    }
  }

  private async processMessage(work: HostWorkMessage): Promise<void> {
    if (!this.hostToken) {
      return;
    }

    const auth = await this.codexBridge.getAuthState();
    const tailscale = await getTailscaleStatus(Number(new URL(this.gatewayUrl).port || 43111));
    await this.gateway.heartbeat(this.hostToken, { auth, tailscale });

    if (auth.status !== "logged_in") {
      await this.gateway.failTurn(this.hostToken, {
        sessionId: work.session.id,
        userMessageId: work.message.id,
        assistantMessageId: null,
        threadId: work.session.threadId,
        turnId: null,
        errorMessage: auth.detail ?? "Codex is not logged in. Run `codex login --device-auth` on the desktop."
      });
      return;
    }

    const assistantMessageId = createId("msg");
    let started = false;

    try {
      const result = await this.codexBridge.runTurn({
        cwd: work.session.rootPath,
        threadId: work.session.threadId,
        text: work.message.content,
        onTurnStarted: async ({ threadId, turnId }) => {
          this.activeRun = {
            sessionId: work.session.id,
            userMessageId: work.message.id,
            assistantMessageId,
            threadId,
            turnId,
            interrupting: false
          };
          started = true;
          await this.gateway.startTurn(this.hostToken as string, {
            sessionId: work.session.id,
            userMessageId: work.message.id,
            threadId,
            turnId,
            assistantMessageId
          });
        },
        onDelta: async (delta) => {
          await this.gateway.appendAssistantDelta(this.hostToken as string, {
            sessionId: work.session.id,
            assistantMessageId,
            delta
          });
        }
      });

      if (this.activeRun?.interrupting) {
        await this.gateway.interruptTurn(this.hostToken, {
          sessionId: work.session.id,
          assistantMessageId,
          turnId: result.turnId
        });
      } else {
        await this.gateway.completeTurn(this.hostToken, {
          sessionId: work.session.id,
          userMessageId: work.message.id,
          assistantMessageId,
          threadId: result.threadId,
          turnId: result.turnId
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Codex run failed.";
      if (started && this.activeRun?.interrupting) {
        await this.gateway.interruptTurn(this.hostToken, {
          sessionId: work.session.id,
          assistantMessageId,
          turnId: this.activeRun.turnId
        });
      } else {
        await this.gateway.failTurn(this.hostToken, {
          sessionId: work.session.id,
          userMessageId: work.message.id,
          assistantMessageId: started ? assistantMessageId : null,
          threadId: this.activeRun?.threadId ?? work.session.threadId,
          turnId: this.activeRun?.turnId ?? null,
          errorMessage: message
        });
      }
    } finally {
      this.activeRun = null;
    }
  }
}

function parseRoots(raw: string | undefined): string[] {
  const roots = raw?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (!roots.length) {
    throw new Error("DESKTOP_APPROVED_ROOTS must include at least one absolute path.");
  }
  return roots;
}
