import { realpath } from "node:fs/promises";
import path from "node:path";
import { isPathInsideRoots } from "@adam-connect/core";

export async function resolveApprovedRoots(roots: string[]): Promise<string[]> {
  const resolvedRoots = await Promise.all(roots.map((root) => realpath(root)));
  return resolvedRoots.map((root) => path.normalize(root));
}

export async function resolveFileWithinRoots(relativePath: string, approvedRoots: string[]): Promise<string> {
  if (relativePath.includes("\0")) {
    throw new Error("Invalid file path.");
  }

  for (const root of approvedRoots) {
    const joined = path.resolve(root, relativePath);
    try {
      const actualPath = path.normalize(await realpath(joined));
      if (isPathInsideRoots(actualPath, approvedRoots)) {
        return actualPath;
      }
    } catch {
      continue;
    }
  }

  throw new Error("Requested file is outside approved roots or does not exist.");
}
