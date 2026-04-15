import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  createOutboundRecipientRequestSchema,
  createSessionRequestSchema,
  hostAssistantDeltaRequestSchema,
  hostCompleteTurnRequestSchema,
  hostFailTurnRequestSchema,
  hostHeartbeatRequestSchema,
  hostInterruptTurnRequestSchema,
  hostStartTurnRequestSchema,
  pairingCompleteRequestSchema,
  postMessageRequestSchema,
  registerPushTokenRequestSchema,
  registerHostRequestSchema,
  renameDeviceRequestSchema,
  sendExternalMessageRequestSchema,
  sendTestNotificationRequestSchema,
  updateNotificationPrefsRequestSchema,
  updateSessionRequestSchema
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

for (const envPath of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")]) {
  dotenv.config({ path: envPath, override: false });
}

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

function assertLoopbackRequest(req: IncomingMessage): void {
  const remoteAddress = req.socket.remoteAddress ?? "";
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress)) {
    throw new Error("Desktop shell controls are only available on this desktop.");
  }
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

    if (method === "GET" && url.pathname === "/api/desktop-shell/state") {
      assertLoopbackRequest(req);
      sendJson(res, 200, await store.getDesktopShellState());
      return;
    }

    if (method === "POST" && url.pathname === "/api/desktop-shell/session") {
      assertLoopbackRequest(req);
      sendJson(res, 200, await store.ensureDesktopShellSession());
      return;
    }

    if (method === "POST" && /^\/api\/desktop-shell\/sessions\/[^/]+\/messages$/.test(url.pathname)) {
      assertLoopbackRequest(req);
      const sessionId = url.pathname.split("/")[4];
      const parsed = postMessageRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.postDesktopShellMessage(sessionId, parsed));
      return;
    }

    if (method === "POST" && /^\/api\/desktop-shell\/sessions\/[^/]+\/stop$/.test(url.pathname)) {
      assertLoopbackRequest(req);
      const sessionId = url.pathname.split("/")[4];
      sendJson(res, 200, await store.stopDesktopShellSession(sessionId));
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
      res.setHeader("content-disposition", 'attachment; filename="freedom.apk"');
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("x-download-options", "noopen");
      res.setHeader("cache-control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("pragma", "no-cache");
      res.setHeader("expires", "0");
      res.setHeader("surrogate-control", "no-store");
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

    if (method === "POST" && url.pathname === "/realtime/ticket") {
      sendJson(res, 200, await store.createRealtimeTicket(readBearer(req)));
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

    if (method === "GET" && url.pathname === "/devices") {
      sendJson(res, 200, await store.listDevices(readBearer(req)));
      return;
    }

    if (method === "PATCH" && /^\/devices\/[^/]+$/.test(url.pathname)) {
      const deviceId = url.pathname.split("/")[2];
      const parsed = renameDeviceRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.renameDevice(readBearer(req), deviceId, parsed));
      return;
    }

    if (method === "POST" && /^\/devices\/[^/]+\/revoke$/.test(url.pathname)) {
      const deviceId = url.pathname.split("/")[2];
      sendJson(res, 200, await store.revokeDevice(readBearer(req), deviceId));
      return;
    }

    if (method === "POST" && /^\/devices\/[^/]+\/push-token$/.test(url.pathname)) {
      const deviceId = url.pathname.split("/")[2];
      const parsed = registerPushTokenRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.registerPushToken(readBearer(req), deviceId, parsed));
      return;
    }

    if (method === "POST" && /^\/devices\/[^/]+\/notification-prefs$/.test(url.pathname)) {
      const deviceId = url.pathname.split("/")[2];
      const parsed = updateNotificationPrefsRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.updateNotificationPrefs(readBearer(req), deviceId, parsed));
      return;
    }

    if (method === "POST" && /^\/devices\/[^/]+\/test-notification$/.test(url.pathname)) {
      const deviceId = url.pathname.split("/")[2];
      const parsed = sendTestNotificationRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.sendTestNotification(readBearer(req), deviceId, parsed.event));
      return;
    }

    if (method === "GET" && url.pathname === "/outbound/recipients") {
      sendJson(res, 200, await store.listOutboundRecipients(readBearer(req)));
      return;
    }

    if (method === "POST" && url.pathname === "/outbound/recipients") {
      const parsed = createOutboundRecipientRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.createOutboundRecipient(readBearer(req), parsed));
      return;
    }

    if (method === "DELETE" && /^\/outbound\/recipients\/[^/]+$/.test(url.pathname)) {
      const recipientId = url.pathname.split("/")[3];
      sendJson(res, 200, await store.deleteOutboundRecipient(readBearer(req), recipientId));
      return;
    }

    if (method === "POST" && url.pathname === "/outbound/send") {
      const parsed = sendExternalMessageRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.sendExternalMessage(readBearer(req), parsed));
      return;
    }

    if (method === "POST" && url.pathname === "/sessions") {
      const parsed = createSessionRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.createSession(readBearer(req), parsed));
      return;
    }

    if (method === "PATCH" && /^\/sessions\/[^/]+$/.test(url.pathname)) {
      const sessionId = url.pathname.split("/")[2];
      const parsed = updateSessionRequestSchema.parse(await readJson(req));
      sendJson(res, 200, await store.updateSession(readBearer(req), sessionId, parsed));
      return;
    }

    if (method === "DELETE" && /^\/sessions\/[^/]+$/.test(url.pathname)) {
      const sessionId = url.pathname.split("/")[2];
      sendJson(res, 200, await store.deleteSession(readBearer(req), sessionId));
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

  const ticket = url.searchParams.get("ticket");
  if (!ticket) {
    socket.destroy();
    return;
  }

  void store
    .consumeRealtimeTicket(ticket)
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
