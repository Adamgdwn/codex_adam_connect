export const FREEDOM_PRODUCT_NAME = "Freedom";
export const FREEDOM_RUNTIME_NAME = "Freedom Connect";
export const FREEDOM_PRIMARY_SESSION_TITLE = "Freedom";

export const LEGACY_PRIMARY_SESSION_TITLES = ["operator", "freedom"] as const;

export function isPrimaryFreedomSessionTitle(title: string | null | undefined): boolean {
  return Boolean(title && LEGACY_PRIMARY_SESSION_TITLES.includes(title.trim().toLowerCase() as (typeof LEGACY_PRIMARY_SESSION_TITLES)[number]));
}
