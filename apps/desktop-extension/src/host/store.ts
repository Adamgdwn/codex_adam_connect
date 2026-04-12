import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface HostLocalState {
  hostToken: string | null;
  hostId: string | null;
  hostName: string | null;
  gatewayUrl: string | null;
  pairingCode: string | null;
  pairingCodeIssuedAt: string | null;
  codexAuthStatus: "logged_in" | "logged_out" | "error" | null;
  codexAuthDetail: string | null;
  tailscaleStatus: "connected" | "not_connected" | "not_installed" | "unknown";
  tailscaleDetail: string | null;
  tailscaleSuggestedUrl: string | null;
}

const defaultState: HostLocalState = {
  hostToken: null,
  hostId: null,
  hostName: null,
  gatewayUrl: null,
  pairingCode: null,
  pairingCodeIssuedAt: null,
  codexAuthStatus: null,
  codexAuthDetail: null,
  tailscaleStatus: "unknown",
  tailscaleDetail: null,
  tailscaleSuggestedUrl: null
};

export class HostStateStore {
  private readonly filePath: string;

  constructor(dataDir = ".local-data/desktop") {
    this.filePath = path.join(dataDir, "host-state.json");
  }

  async read(): Promise<HostLocalState> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await readFile(this.filePath, "utf8");
      return { ...defaultState, ...(JSON.parse(raw) as Partial<HostLocalState>) };
    } catch {
      await this.write(defaultState);
      return { ...defaultState };
    }
  }

  async write(state: HostLocalState): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }
}
