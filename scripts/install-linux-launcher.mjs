import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const applicationsDir = path.join(os.homedir(), ".local", "share", "applications");
const desktopFilePath = path.join(applicationsDir, "freedom-desktop.desktop");
const legacyDesktopFilePath = path.join(applicationsDir, "adam-connect.desktop");
const iconPath = path.join(repoRoot, "apps/desktop-shell/assets/freedom-icon.svg");
const launcherScriptPath = path.join(repoRoot, "scripts/launch-adam-connect-desktop.sh");

const desktopFile = `[Desktop Entry]
Version=1.0
Type=Application
Name=Freedom Desktop
Comment=Launch the Freedom native desktop shell and local services
Exec=${launcherScriptPath}
Path=${repoRoot}
Icon=${iconPath}
Terminal=false
Categories=Development;Utility;
StartupNotify=true
`;

await mkdir(applicationsDir, { recursive: true });
await rm(legacyDesktopFilePath, { force: true });
await writeFile(desktopFilePath, desktopFile, "utf8");
await chmod(desktopFilePath, 0o755);
await chmod(launcherScriptPath, 0o755);

process.stdout.write(`Installed launcher at ${desktopFilePath}\n`);
