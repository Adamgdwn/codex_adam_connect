import path from "node:path";

export function isPathInsideRoots(candidatePath: string, approvedRoots: string[]): boolean {
  return approvedRoots.some((root) => {
    const relative = path.relative(root, candidatePath);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  });
}
