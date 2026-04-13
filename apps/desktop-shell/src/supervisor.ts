import { EventEmitter } from "node:events";
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { DesktopOverviewResponse } from "@adam-connect/shared";

interface SupervisorStatus {
  state: "idle" | "starting" | "ready" | "restarting" | "error";
  message: string;
  detail?: string;
}

interface ManagedProcess {
  name: string;
  child: ChildProcess;
}

interface SupervisorEvents {
  status: (status: SupervisorStatus) => void;
  overview: (overview: DesktopOverviewResponse) => void;
}

type SupervisorEventName = keyof SupervisorEvents;
type SupervisorEventHandler<T extends SupervisorEventName> = SupervisorEvents[T];

export class DesktopShellSupervisor {
  private readonly events = new EventEmitter();
  private readonly repoRoot = path.resolve(__dirname, "../../..");
  private readonly localBaseUrl = process.env.DESKTOP_GATEWAY_URL?.trim() || `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 43111}`;
  private readonly gatewayDataDir =
    process.env.GATEWAY_DATA_DIR?.trim() || path.join(this.repoRoot, "apps/gateway/.local-data/gateway");
  private readonly desktopDataDir =
    process.env.DESKTOP_DATA_DIR?.trim() || path.join(this.repoRoot, "apps/desktop-extension/.local-data/desktop");
  private readonly overviewUrl = `${this.localBaseUrl.replace(/\/+$/, "")}/api/desktop/overview`;
  private readonly healthUrl = `${this.localBaseUrl.replace(/\/+$/, "")}/healthz`;
  private readonly managed: ManagedProcess[] = [];
  private latestOverview: DesktopOverviewResponse | null = null;
  private shuttingDown = false;
  private ownsProcesses = false;
  private restarting = false;

  on<T extends SupervisorEventName>(event: T, handler: SupervisorEventHandler<T>): () => void {
    this.events.on(event, handler);
    return () => {
      this.events.off(event, handler);
    };
  }

  getOverview(): DesktopOverviewResponse | null {
    return this.latestOverview;
  }

  getDashboardUrl(): string {
    return `${this.localBaseUrl.replace(/\/+$/, "")}/`;
  }

  async start(): Promise<DesktopOverviewResponse> {
    this.emitStatus({
      state: "starting",
      message: "Starting Adam Connect",
      detail: "Checking whether the local dashboard is already running."
    });

    const existing = await this.fetchOverview(1_500);
    if (existing) {
      this.latestOverview = existing;
      this.ownsProcesses = false;
      this.emitOverview(existing);
      this.emitStatus({
        state: "ready",
        message: "Adam Connect is already running",
        detail: existing.publicBaseUrl
      });
      return existing;
    }

    this.emitStatus({
      state: "starting",
      message: "Booting local services",
      detail: "Launching the gateway and desktop host."
    });
    await this.startManagedProcesses();
    const ready = await this.waitForOverview();
    this.latestOverview = ready;
    this.emitOverview(ready);
    this.emitStatus({
      state: "ready",
      message: "Desktop services are ready",
      detail: ready.publicBaseUrl
    });
    return ready;
  }

  async refreshOverview(timeoutMs = 2_000): Promise<DesktopOverviewResponse | null> {
    const overview = await this.fetchOverview(timeoutMs);
    if (overview) {
      this.latestOverview = overview;
      this.emitOverview(overview);
    }
    return overview;
  }

  async restart(): Promise<DesktopOverviewResponse> {
    if (this.restarting) {
      const existing = this.latestOverview ?? (await this.waitForOverview());
      return existing;
    }

    this.restarting = true;
    this.emitStatus({
      state: "restarting",
      message: "Restarting Adam Connect",
      detail: "Refreshing the gateway and desktop host."
    });

    try {
      await this.stop();
      this.shuttingDown = false;
      return await this.start();
    } finally {
      this.restarting = false;
    }
  }

  async stop(): Promise<void> {
    this.shuttingDown = true;
    for (const managed of this.managed.splice(0)) {
      if (!managed.child.killed) {
        managed.child.kill("SIGTERM");
      }
    }
    await delay(300);
  }

  private async startManagedProcesses(): Promise<void> {
    if (this.managed.length) {
      return;
    }

    this.ownsProcesses = true;
    this.managed.push(this.spawnManaged("gateway", ["run", "dev:gateway"]));
    await this.waitForHealth();
    this.managed.push(this.spawnManaged("desktop", ["run", "dev:desktop"]));
  }

  private spawnManaged(name: string, args: string[]): ManagedProcess {
    const command = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(command, args, {
      cwd: this.repoRoot,
      env: {
        ...process.env,
        DESKTOP_APPROVED_ROOTS: process.env.DESKTOP_APPROVED_ROOTS?.trim() || this.repoRoot,
        DESKTOP_HOST_NAME: process.env.DESKTOP_HOST_NAME?.trim() || "Adam Connect Desktop",
        DESKTOP_GATEWAY_URL: this.localBaseUrl,
        DESKTOP_DATA_DIR: this.desktopDataDir,
        GATEWAY_DATA_DIR: this.gatewayDataDir
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      process.stdout.write(`[shell:${name}] ${chunk}`);
    });

    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      process.stderr.write(`[shell:${name}] ${chunk}`);
    });

    child.on("exit", (code, signal) => {
      if (this.shuttingDown) {
        return;
      }
      this.emitStatus({
        state: "error",
        message: `${name} stopped unexpectedly`,
        detail: signal ? `Signal ${signal}` : `Exit code ${code ?? 0}`
      });
    });

    return { name, child };
  }

  private async waitForOverview(timeoutMs = 45_000): Promise<DesktopOverviewResponse> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const overview = await this.fetchOverview(2_000);
      if (overview) {
        return overview;
      }
      await delay(800);
    }

    throw new Error(`Adam Connect did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`);
  }

  private async waitForHealth(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(this.healthUrl, { signal: AbortSignal.timeout(1_500) });
        if (response.ok) {
          return;
        }
      } catch {
        // Keep polling until the gateway is accepting requests.
      }
      await delay(400);
    }

    throw new Error(`Adam Connect gateway did not become healthy within ${Math.round(timeoutMs / 1000)} seconds.`);
  }

  private async fetchOverview(timeoutMs: number): Promise<DesktopOverviewResponse | null> {
    try {
      const response = await fetch(this.overviewUrl, { signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as DesktopOverviewResponse;
    } catch {
      return null;
    }
  }

  private emitStatus(status: SupervisorStatus): void {
    this.events.emit("status", status);
  }

  private emitOverview(overview: DesktopOverviewResponse): void {
    this.events.emit("overview", overview);
  }
}
