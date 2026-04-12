import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shouldOpenBrowser = !process.argv.includes("--no-open");
const gatewayPort = Number(process.env.GATEWAY_PORT ?? 43111);
const dashboardUrl = `http://127.0.0.1:${gatewayPort}/`;

const sharedEnv = {
  ...process.env,
  DESKTOP_APPROVED_ROOTS: process.env.DESKTOP_APPROVED_ROOTS?.trim() || repoRoot,
  DESKTOP_HOST_NAME: process.env.DESKTOP_HOST_NAME?.trim() || "Adam Connect Desktop",
  DESKTOP_GATEWAY_URL: process.env.DESKTOP_GATEWAY_URL?.trim() || `http://127.0.0.1:${gatewayPort}`
};

process.stdout.write("Launching Adam Connect desktop...\n");
if (!process.env.DESKTOP_APPROVED_ROOTS?.trim()) {
  process.stdout.write(`Using default approved root: ${sharedEnv.DESKTOP_APPROVED_ROOTS}\n`);
}

let shuttingDown = false;
let browserOpened = false;
const children = [];

function spawnNpmProcess(name, args) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: sharedEnv,
    stdio: ["inherit", "pipe", "pipe"]
  });

  pipeOutput(child.stdout, name, process.stdout);
  pipeOutput(child.stderr, name, process.stderr);

  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      process.stderr.write(`[${name}] exited ${signal ? `with signal ${signal}` : `with code ${code ?? 0}`}\n`);
      shutdown(code ?? 1);
    }
  });

  return child;
}

function pipeOutput(stream, prefix, target) {
  if (!stream) {
    return;
  }

  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      target.write(`[${prefix}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer) {
      target.write(`[${prefix}] ${buffer}\n`);
    }
  });
}

async function waitForDashboard(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) {
        return true;
      }
    } catch {
      // Keep polling until the desktop surface is ready.
    }
    await delay(750);
  }
  return false;
}

async function openBrowser(url) {
  const attempts =
    process.platform === "darwin"
      ? [{ command: "open", args: [url], shell: false }]
      : process.platform === "win32"
        ? [{ command: "cmd", args: ["/c", "start", "", url], shell: true }]
        : [{ command: "xdg-open", args: [url], shell: false }];

  for (const attempt of attempts) {
    try {
      const opened = await new Promise((resolve) => {
        const child = spawn(attempt.command, attempt.args, {
          cwd: repoRoot,
          detached: true,
          shell: attempt.shell,
          stdio: "ignore"
        });
        child.once("error", () => resolve(false));
        child.once("spawn", () => {
          child.unref();
          resolve(true);
        });
      });

      if (opened) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

async function start() {
  const alreadyRunning = await waitForDashboard(dashboardUrl, 1_500);
  if (alreadyRunning) {
    process.stdout.write(`Adam Connect is already running at ${dashboardUrl}\n`);
    if (shouldOpenBrowser && !browserOpened) {
      browserOpened = await openBrowser(dashboardUrl);
      if (browserOpened) {
        process.stdout.write("Opened the existing Adam Connect dashboard in your browser.\n");
      } else {
        process.stdout.write(`Open this URL in your browser: ${dashboardUrl}\n`);
      }
    }
    return;
  }

  children.push(spawnNpmProcess("gateway", ["run", "dev:gateway"]));
  children.push(spawnNpmProcess("desktop", ["run", "dev:desktop"]));

  const ready = await waitForDashboard(dashboardUrl);
  if (!ready) {
    process.stderr.write(`Dashboard did not become ready in time: ${dashboardUrl}\n`);
    shutdown(1);
    return;
  }

  process.stdout.write(`Dashboard ready at ${dashboardUrl}\n`);

  if (shouldOpenBrowser && !browserOpened) {
    browserOpened = await openBrowser(dashboardUrl);
    if (browserOpened) {
      process.stdout.write("Opened Adam Connect in your browser.\n");
    } else {
      process.stdout.write(`Open this URL in your browser: ${dashboardUrl}\n`);
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  setTimeout(() => process.exit(code), 250);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

void start();
