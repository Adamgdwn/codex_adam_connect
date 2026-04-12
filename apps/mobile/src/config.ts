export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function websocketUrlFromBase(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.startsWith("https://")) {
    return `wss://${normalized.slice("https://".length)}/ws`;
  }
  return `ws://${normalized.replace(/^http:\/\//, "")}/ws`;
}
