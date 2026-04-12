import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname, "..");
dotenv.config({ path: path.join(repoRoot, ".env") });

const defaultBaseUrl =
  process.env.MOBILE_DEFAULT_BASE_URL?.trim() || process.env.ADAM_CONNECT_DEFAULT_BASE_URL?.trim() || "";

const targetPath = path.join(repoRoot, "apps/mobile/src/generated/runtimeConfig.ts");
await fs.mkdir(path.dirname(targetPath), { recursive: true });
await fs.writeFile(
  targetPath,
  `export const DEFAULT_BASE_URL = ${JSON.stringify(defaultBaseUrl)};\n`,
  "utf8"
);
