import { promisify } from "node:util";
import { execFile as execFileCallback } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createSocket } from "node:dgram";
import { Socket } from "node:net";
import path from "node:path";
import dotenv from "dotenv";
import { wakeRelayRequestSchema, type WakeRelayResponse, wakeRelayTargetsResponseSchema } from "@adam-connect/shared";

const execFile = promisify(execFileCallback);

for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  dotenv.config({ path: envPath, override: false });
}

type WakeTarget = {
  id: string;
  label: string;
  macAddress: string;
  host?: string;
  pingPort?: number;
  broadcastAddress?: string;
  wolPort?: number;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

const port = Number(process.env.WAKE_RELAY_PORT ?? 43112);
const host = process.env.WAKE_RELAY_HOST ?? "0.0.0.0";
const relayToken = process.env.WAKE_RELAY_TOKEN?.trim() ?? "";
const wakeTargets = readTargets();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        targetCount: wakeTargets.length
      });
      return;
    }

    requireAuth(req);

    if (method === "GET" && url.pathname === "/targets") {
      sendJson(
        res,
        200,
        wakeRelayTargetsResponseSchema.parse({
          targets: wakeTargets.map((target) => ({
            id: target.id,
            label: target.label
          }))
        })
      );
      return;
    }

    if (method === "POST" && url.pathname === "/wake") {
      const parsed = wakeRelayRequestSchema.parse(await readJson(req));
      const target = wakeTargets.find((item) => item.id === parsed.targetId);
      if (!target) {
        throw new Error("Wake target not found.");
      }

      const response = await wakeTarget(target);
      sendJson(res, 200, response);
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    sendJson(res, 400, { error: message });
  }
});

server.listen(port, host, () => {
  process.stdout.write(`Wake relay listening on http://${host}:${port}\n`);
});

async function wakeTarget(target: WakeTarget): Promise<WakeRelayResponse> {
  const requestedAt = new Date().toISOString();
  try {
    await sendMagicPacket(target);
  } catch (error) {
    return {
      targetId: target.id,
      targetLabel: target.label,
      status: "error",
      detail: error instanceof Error ? error.message : "Could not send the wake packet.",
      requestedAt,
      completedAt: new Date().toISOString()
    };
  }

  if (!target.host) {
    return {
      targetId: target.id,
      targetLabel: target.label,
      status: "sent",
      detail: "Wake packet sent. No health check target was configured for this machine.",
      requestedAt,
      completedAt: new Date().toISOString()
    };
  }

  const timeoutMs = target.timeoutMs ?? Number(process.env.WAKE_RELAY_TIMEOUT_MS ?? 45_000);
  const pollIntervalMs = target.pollIntervalMs ?? Number(process.env.WAKE_RELAY_POLL_INTERVAL_MS ?? 3_000);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isTargetAwake(target)) {
      return {
        targetId: target.id,
        targetLabel: target.label,
        status: "awake",
        detail: target.pingPort
          ? `Wake packet sent and ${target.host}:${target.pingPort} is reachable.`
          : `Wake packet sent and ${target.host} is responding.`,
        requestedAt,
        completedAt: new Date().toISOString()
      };
    }
    await sleep(pollIntervalMs);
  }

  return {
    targetId: target.id,
    targetLabel: target.label,
    status: "timeout",
    detail: `Wake packet sent, but ${target.host} did not respond before the timeout window closed.`,
    requestedAt,
    completedAt: new Date().toISOString()
  };
}

async function sendMagicPacket(target: WakeTarget): Promise<void> {
  const macBytes = parseMacAddress(target.macAddress);
  const payload = Buffer.alloc(6 + 16 * macBytes.length, 0xff);
  for (let offset = 6; offset < payload.length; offset += macBytes.length) {
    macBytes.copy(payload, offset);
  }

  const socket = createSocket("udp4");
  const address = target.broadcastAddress ?? process.env.WAKE_RELAY_BROADCAST_ADDRESS ?? "255.255.255.255";
  const wolPort = target.wolPort ?? Number(process.env.WAKE_RELAY_WOL_PORT ?? 9);

  await new Promise<void>((resolve, reject) => {
    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(payload, wolPort, address, (error) => {
        socket.close();
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
}

async function isTargetAwake(target: WakeTarget): Promise<boolean> {
  if (target.pingPort) {
    return canConnectToPort(target.host!, target.pingPort);
  }

  return pingHost(target.host!);
}

async function canConnectToPort(hostname: string, port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(1200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, hostname);
  });
}

async function pingHost(hostname: string): Promise<boolean> {
  try {
    await execFile("ping", ["-c", "1", "-W", "1", hostname], {
      timeout: 2_000
    });
    return true;
  } catch {
    return false;
  }
}

function requireAuth(req: IncomingMessage): void {
  if (!relayToken) {
    throw new Error("WAKE_RELAY_TOKEN is not configured.");
  }

  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== relayToken) {
    throw new Error("Wake relay token required.");
  }
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as T) : ({} as T);
}

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readTargets(): WakeTarget[] {
  const raw = process.env.WAKE_RELAY_TARGETS_JSON?.trim();
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("WAKE_RELAY_TARGETS_JSON must be a JSON array.");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Wake relay target ${index + 1} is invalid.`);
    }
    const record = item as Record<string, unknown>;
    const id = String(record.id ?? "").trim();
    const label = String(record.label ?? "").trim();
    const macAddress = String(record.macAddress ?? "").trim();
    if (!id || !label || !macAddress) {
      throw new Error(`Wake relay target ${index + 1} needs id, label, and macAddress.`);
    }

    return {
      id,
      label,
      macAddress,
      ...(typeof record.host === "string" && record.host.trim() ? { host: record.host.trim() } : {}),
      ...(typeof record.pingPort === "number" ? { pingPort: record.pingPort } : {}),
      ...(typeof record.broadcastAddress === "string" && record.broadcastAddress.trim()
        ? { broadcastAddress: record.broadcastAddress.trim() }
        : {}),
      ...(typeof record.wolPort === "number" ? { wolPort: record.wolPort } : {}),
      ...(typeof record.timeoutMs === "number" ? { timeoutMs: record.timeoutMs } : {}),
      ...(typeof record.pollIntervalMs === "number" ? { pollIntervalMs: record.pollIntervalMs } : {})
    } satisfies WakeTarget;
  });
}

function parseMacAddress(value: string): Buffer {
  const normalized = value.replace(/[^a-fA-F0-9]/g, "");
  if (normalized.length !== 12) {
    throw new Error("Wake target MAC address must contain 12 hex characters.");
  }

  return Buffer.from(normalized, "hex");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
