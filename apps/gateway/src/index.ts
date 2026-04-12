import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  createSessionRequestSchema,
  hostAssistantDeltaRequestSchema,
  hostCompleteTurnRequestSchema,
  hostFailTurnRequestSchema,
  hostHeartbeatRequestSchema,
  hostInterruptTurnRequestSchema,
  hostStartTurnRequestSchema,
  pairingCompleteRequestSchema,
  postMessageRequestSchema,
  registerHostRequestSchema
} from "@adam-connect/shared";
import { WebSocketServer } from "ws";
import {
  buildDesktopOverviewResponse,
  buildInstallPageModel,
  findAndroidArtifact,
  renderDesktopPage,
  renderInstallPage,
  renderInstallQrSvg
} from "./installPage.js";
import { GatewayStore } from "./store.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const port = Number(process.env.GATEWAY_PORT ?? 43111);
const host = process.env.GATEWAY_HOST ?? "0.0.0.0";
const dataDir = process.env.GATEWAY_DATA_DIR ?? ".local-data/gateway";
const store = new GatewayStore(dataDir);
const subscriptions = new Map<string, Set<import("ws").WebSocket>>();

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(body);
}

function sendSvg(res: ServerResponse, statusCode: number, body: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "image/svg+xml; charset=utf-8");
  res.end(body);
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as T) : ({} as T);
}

function readBearer(req: IncomingMessage): string {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) {
    throw new Error("Missing bearer token.");
  }
  return token;
}

function addSubscription(hostId: string, socket: import("ws").WebSocket): void {
  const sockets = subscriptions.get(hostId) ?? new Set<import("ws").WebSocket>();
  sockets.add(socket);
  subscriptions.set(hostId, sockets);
  socket.on("close", () => {
    sockets.delete(socket);
    if (!sockets.size) {
      subscriptions.delete(hostId);
    }
  });
}

store.onBroadcast(({ hostId, event }) => {
  const sockets = subscriptions.get(hostId);
  if (!sockets?.size) {
    return;
  }
  const payload = JSON.stringify(event);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) {
      socket.send(payload);
    }
  }
});

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const method = req.method ?? "GET";

    if (method === "GET" && url.pathname === "/") {
      const overview = await store.getOverview();
      sendHtml(res, 200, renderDesktopPage(await buildInstallPageModel(req, overview)));
      return;
    }

    if (method === "GET" && url.pathname === "/install") {
      const overview = await store.getOverview();
      sendHtml(res, 200, renderInstallPage(await buildInstallPageModel(req, overview)));
      return;
    }

    if (method === "GET" && url.pathname === "/install/qr.svg") {
      const overview = await store.getOverview();
      sendSvg(res, 200, await renderInstallQrSvg(req, overview));
      return;
    }

    if (method === "GET" && url.pathname === "/api/desktop/overview") {
      const overview = await store.getOverview();
      sendJson(res, 200, await buildDesktopOverviewResponse(req, overview));
      return;
    }

    if (method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (method === "GET" && url.pathname === "/downloads/android/latest.apk") {
      const artifact = await findAndroidArtifact();
      if (!artifact) {
        sendJson(res, 404, { error: "Android APK not found on this desktop yet." });
        return;
      }

      res.statusCode = 200;
      res.setHeader("content-type", "application/vnd.android.package-archive");
      res.setHeader("content-length", String(artifact.sizeBytes));
      res.setHeader("content-disposition", `attachment; filename="${artifact.fileName}"`);
      createReadStream(artifact.filePath).pipe(res);
      return;
    }

    if (method === "POST" && url.pathname === "/host/register") {
      const parsed = registerHostRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.registerHost(parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/pairing/complete") {
      const parsed = pairingCompleteRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.completePairing(parsed.pairingCode, parsed.deviceName));
      return;
    }

    if (method === "GET" && url.pathname === "/host/status") {
      sendJson(res, 200, await store.getHostStatus(readBearer(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/host/heartbeat") {
      const parsed = hostHeartbeatRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.heartbeat(readBearer(req), parsed));
      return;
    }

    if (method === "GET" && url.pathname === "/host/work") {
      sendJson(res, 200, await store.getNextWork(readBearer(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/host/turn/start") {
      const parsed = hostStartTurnRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.startTurn(readBearer(req), parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/host/turn/delta") {
      const parsed = hostAssistantDeltaRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.appendAssistantDelta(readBearer(req), parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/host/turn/complete") {
      const parsed = hostCompleteTurnRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.completeTurn(readBearer(req), parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/host/turn/fail") {
      const parsed = hostFailTurnRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.failTurn(readBearer(req), parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/host/turn/interrupt") {
      const parsed = hostInterruptTurnRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.interruptTurn(readBearer(req), parsed));
      return;
    }

    if (method === "GET" && url.pathname === "/sessions") {
      sendJson(res, 200, await store.listSessions(readBearer(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/sessions") {
      const parsed = createSessionRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.createSession(readBearer(req), parsed));
      return;
    }

    if (method === "GET" && /^\/sessions\/[^/]+\/messages$/.test(url.pathname)) {
      const sessionId = url.pathname.split("/")[2];
      sendJson(res, 200, await store.listMessages(readBearer(req), sessionId));
      return;
    }

    if (method === "POST" && /^\/sessions\/[^/]+\/messages$/.test(url.pathname)) {
      const sessionId = url.pathname.split("/")[2];
      const parsed = postMessageRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.postMessage(readBearer(req), sessionId, parsed));
      return;
    }

    if (method === "POST" && /^\/sessions\/[^/]+\/stop$/.test(url.pathname)) {
      const sessionId = url.pathname.split("/")[2];
      sendJson(res, 200, await store.stopSession(readBearer(req), sessionId));
      return;
    }

    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    sendJson(res, 400, { error: message });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const token = url.searchParams.get("token");
  if (!token) {
    socket.destroy();
    return;
  }

  void store
    .getTokenHostId(token)
    .then((hostId) => {
      wss.handleUpgrade(req, socket, head, (ws) => {
        addSubscription(hostId, ws);
        ws.send(JSON.stringify({ type: "hello" }));
      });
    })
    .catch(() => {
      socket.destroy();
    });
});

server.listen(port, host, () => {
  process.stdout.write(`Gateway listening on http://${host}:${port}\n`);
});
