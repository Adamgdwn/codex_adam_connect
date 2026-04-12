import { DesktopHostRuntime } from "./runtime.js";

const runtime = new DesktopHostRuntime();

void runtime.start();

process.on("SIGINT", () => {
  runtime.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  runtime.stop();
  process.exit(0);
});
