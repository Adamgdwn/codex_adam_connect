import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function resolveCodexBinary(preferred = process.env.CODEX_BIN?.trim()): string {
  if (preferred && preferred !== "codex") {
    return preferred;
  }

  const pathResolved = resolveFromPath("codex");
  if (pathResolved) {
    return pathResolved;
  }

  const vscodeResolved = resolveFromVsCodeExtensions();
  if (vscodeResolved) {
    return vscodeResolved;
  }

  return preferred || "codex";
}

function resolveFromPath(command: string): string | null {
  const pathValue = process.env.PATH;
  if (!pathValue) {
    return null;
  }

  for (const entry of pathValue.split(path.delimiter)) {
    if (!entry) {
      continue;
    }

    const resolved = path.join(entry, command);
    if (isExecutableFile(resolved)) {
      return resolved;
    }

    if (process.platform === "win32") {
      for (const extension of [".exe", ".cmd", ".bat"]) {
        const windowsResolved = `${resolved}${extension}`;
        if (isExecutableFile(windowsResolved)) {
          return windowsResolved;
        }
      }
    }
  }

  return null;
}

function resolveFromVsCodeExtensions(): string | null {
  const homeDir = os.homedir();
  const extensionRoots = [
    path.join(homeDir, ".vscode", "extensions"),
    path.join(homeDir, ".vscode-insiders", "extensions")
  ];

  for (const root of extensionRoots) {
    const resolved = resolveFromExtensionRoot(root);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function resolveFromExtensionRoot(root: string): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }

  const extensionDirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("openai.chatgpt-"))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const extensionDir of extensionDirs) {
    const binRoot = path.join(root, extensionDir, "bin");
    let binEntries: fs.Dirent[];
    try {
      binEntries = fs.readdirSync(binRoot, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const binEntry of binEntries) {
      if (!binEntry.isDirectory()) {
        continue;
      }

      const baseCandidate = path.join(binRoot, binEntry.name, "codex");
      if (isExecutableFile(baseCandidate)) {
        return baseCandidate;
      }

      const windowsCandidate = `${baseCandidate}.exe`;
      if (isExecutableFile(windowsCandidate)) {
        return windowsCandidate;
      }
    }
  }

  return null;
}

function isExecutableFile(filePath: string): boolean {
  try {
    if (process.platform === "win32") {
      return fs.statSync(filePath).isFile();
    }

    fs.accessSync(filePath, fs.constants.X_OK);
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}
