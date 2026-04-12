import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const gatewayPort = 43119;
const gatewayUrl = `http://127.0.0.1:${gatewayPort}`;

assertCodexLogin();

const gateway = startProcess("node", ["apps/gateway/dist/index.js"], {
  ...process.env,
  GATEWAY_PORT: String(gatewayPort),
  GATEWAY_HOST: "127.0.0.1",
  GATEWAY_DATA_DIR: ".local-data/smoke-gateway"
});

const desktop = startProcess("node", ["apps/desktop-extension/dist/host/cli.js"], {
  ...process.env,
  DESKTOP_GATEWAY_URL: gatewayUrl,
  DESKTOP_HOST_NAME: "Smoke Host",
  DESKTOP_APPROVED_ROOTS: repoRoot,
  DESKTOP_DATA_DIR: ".local-data/smoke-desktop",
  CODEX_APP_SERVER_URL: "ws://127.0.0.1:43221"
});

try {
  await waitForHttp(gatewayUrl);
  await waitForFile(path.join(repoRoot, ".local-data/smoke-desktop/host-state.json"));
  const hostState = JSON.parse(
    await readFile(path.join(repoRoot, ".local-data/smoke-desktop/host-state.json"), "utf8")
  );

  const pairing = await request("POST", `${gatewayUrl}/pairing/complete`, undefined, {
    pairingCode: hostState.pairingCode,
    deviceName: "Smoke Pixel"
  });

  const session = await request("POST", `${gatewayUrl}/sessions`, pairing.deviceToken, {
    rootPath: repoRoot
  });

  await request("POST", `${gatewayUrl}/sessions/${session.id}/messages`, pairing.deviceToken, {
    text: "Reply with the exact text 'smoke ok' and nothing else."
  });

  const assistant = await pollForAssistantMessage(gatewayUrl, pairing.deviceToken, session.id);

  console.log("Smoke test passed.");
  console.log(`Session: ${session.id}`);
  console.log(`Assistant: ${assistant.content}`);
} finally {
  gateway.kill("SIGTERM");
  desktop.kill("SIGTERM");
}

function assertCodexLogin() {
  const result = spawnSync(process.env.CODEX_BIN ?? "codex", ["login", "status"], { encoding: "utf8" });
  const status = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (!/logged in/i.test(status)) {
    console.error("Codex must be logged in before running npm run smoke.");
    process.exit(1);
  }
}

function startProcess(command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => process.stdout.write(`[proc] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[proc] ${chunk}`));
  return child;
}

async function waitForFile(filePath) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      await readFile(filePath, "utf8");
      return;
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Desktop host state file was not created.");
}

async function waitForHttp(baseUrl) {
  const started = Date.now();
  while (Date.now() - started < 15000) {
    try {
      const response = await fetch(`${baseUrl}/missing`);
      if (response.status < 500) {
        return;
      }
    } catch {
      await sleep(250);
    }
  }
  throw new Error("Gateway did not start in time.");
}

async function pollForAssistantMessage(baseUrl, token, sessionId) {
  const started = Date.now();
  while (Date.now() - started < 45000) {
    const messages = await request("GET", `${baseUrl}/sessions/${sessionId}/messages`, token);
    const assistant = [...messages].reverse().find(item => item.role === "assistant");
    if (assistant?.status === "completed") {
      return assistant;
    }
    if (assistant?.status === "failed") {
      throw new Error(assistant.errorMessage ?? "Smoke test assistant message failed.");
    }
    await sleep(1000);
  }
  throw new Error("Smoke test timed out waiting for the Codex reply.");
}

async function request(method, url, token, body) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(parsed?.error ?? `HTTP ${response.status}`);
  }
  return parsed;
}

function sleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}
