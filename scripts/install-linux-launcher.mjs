import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicationsDir = path.join(os.homedir(), ".local", "share", "applications");
const desktopFilePath = path.join(applicationsDir, "adam-connect.desktop");
const iconPath = path.join(repoRoot, "apps/desktop-shell/assets/adam-connect-icon.svg");

const desktopFile = `[Desktop Entry]
Version=1.0
Type=Application
Name=Adam Connect Desktop
Comment=Launch the Adam Connect desktop dashboard and local services
Exec=bash -lc 'cd ${escapeExec(repoRoot)} && npm run app:desktop'
Icon=${iconPath}
Terminal=false
Categories=Development;Utility;
StartupNotify=true
`;

await mkdir(applicationsDir, { recursive: true });
await writeFile(desktopFilePath, desktopFile, "utf8");
await chmod(desktopFilePath, 0o755);

process.stdout.write(`Installed launcher at ${desktopFilePath}\n`);

function escapeExec(value) {
  return value.replace(/'/g, `'\\''`);
}
