import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { TailscaleStatus } from "@adam-connect/shared";

const execFileAsync = promisify(execFile);

const INSTALL_URL = "https://tailscale.com/download";
const LOGIN_URL = "https://login.tailscale.com/start";

interface TailscaleStatusJson {
  BackendState?: unknown;
  Self?: {
    DNSName?: unknown;
    TailscaleIPs?: unknown;
  };
  TailscaleIPs?: unknown;
  Health?: unknown;
}

export async function getTailscaleStatus(port: number): Promise<TailscaleStatus> {
  try {
    const { stdout, stderr } = await execFileAsync("tailscale", ["status", "--json"]);
    const combined = `${stdout ?? ""}${stderr ?? ""}`.trim();
    const parsed = JSON.parse(combined) as TailscaleStatusJson;

    const backendState = typeof parsed.BackendState === "string" ? parsed.BackendState : null;
    const dnsName = normalizeDnsName(parsed.Self?.DNSName);
    const ipCandidates = Array.isArray(parsed.Self?.TailscaleIPs)
      ? parsed.Self?.TailscaleIPs
      : Array.isArray(parsed.TailscaleIPs)
        ? parsed.TailscaleIPs
        : [];
    const ipv4 = ipCandidates.find((value): value is string => typeof value === "string" && value.includes(".")) ?? null;
    const connected = backendState === "Running";
    const detail = connected
      ? dnsName
        ? `Connected as ${dnsName}.`
        : "Connected to Tailscale."
      : backendState === "NeedsLogin"
        ? "Tailscale is installed but not logged in on the desktop."
        : backendState
          ? `Tailscale state: ${backendState}.`
          : "Tailscale is installed but not fully connected.";
    const suggestedHost = dnsName ?? ipv4;

    return {
      installed: true,
      connected,
      detail,
      dnsName,
      ipv4,
      suggestedUrl: connected && suggestedHost ? `http://${suggestedHost}:${port}` : null,
      installUrl: INSTALL_URL,
      loginUrl: LOGIN_URL
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tailscale is not available on the desktop.";
    const missing = /ENOENT|not found/i.test(message);
    return {
      installed: !missing,
      connected: false,
      detail: missing ? "Tailscale is not installed on the desktop." : message,
      dnsName: null,
      ipv4: null,
      suggestedUrl: null,
      installUrl: INSTALL_URL,
      loginUrl: LOGIN_URL
    };
  }
}

function normalizeDnsName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  return value.endsWith(".") ? value.slice(0, -1) : value;
}
