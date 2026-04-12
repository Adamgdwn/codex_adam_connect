import { spawn } from "node:child_process";

const repoRoot = process.cwd();

const gateway = spawn("npm", ["run", "dev:gateway"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true
});

const desktop = spawn("npm", ["run", "dev:desktop"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: true
});

function shutdown(code = 0) {
  gateway.kill("SIGTERM");
  desktop.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
gateway.on("exit", (code) => shutdown(code ?? 0));
desktop.on("exit", (code) => shutdown(code ?? 0));
