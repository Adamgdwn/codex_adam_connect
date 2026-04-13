import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");
const entry = process.argv[2];

if (!entry) {
  process.stderr.write("Electron entry file is required.\n");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const appCwd = process.cwd();
const resolvedEntry = path.resolve(appCwd, entry);

const child = spawn(electronBinary, [resolvedEntry], {
  cwd: appCwd,
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
