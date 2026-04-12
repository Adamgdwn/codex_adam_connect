import { access, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import type { ChatSession, DesktopOverviewResponse, GatewayOverview } from "@adam-connect/shared";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const defaultArtifactCandidates = [
  "apps/mobile/android/app/build/outputs/apk/release/app-release.apk",
  "apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk"
];

interface AndroidArtifact {
  filePath: string;
  fileName: string;
  sizeBytes: number;
}

interface InstallPageModel {
  overview: GatewayOverview;
  publicBaseUrl: string;
  dashboardUrl: string;
  installUrl: string;
  qrSvg: string;
  androidArtifact: AndroidArtifact | null;
}

export async function buildInstallPageModel(
  req: IncomingMessage,
  overview: GatewayOverview
): Promise<InstallPageModel> {
  const publicBaseUrl = resolvePublicBaseUrl(req, overview);
  const dashboardUrl = `${publicBaseUrl}/`;
  const installUrl = `${publicBaseUrl}/install`;
  return {
    overview,
    publicBaseUrl,
    dashboardUrl,
    installUrl,
    qrSvg: await QRCode.toString(installUrl, {
      type: "svg",
      margin: 1,
      color: {
        dark: "#11243e",
        light: "#fdf8ef"
      }
    }),
    androidArtifact: await findAndroidArtifact()
  };
}

export async function renderInstallQrSvg(req: IncomingMessage, overview: GatewayOverview): Promise<string> {
  const publicBaseUrl = resolvePublicBaseUrl(req, overview);
  return QRCode.toString(`${publicBaseUrl}/install`, {
    type: "svg",
    margin: 1,
    color: {
      dark: "#11243e",
      light: "#fdf8ef"
    }
  });
}

export async function buildDesktopOverviewResponse(
  req: IncomingMessage,
  overview: GatewayOverview
): Promise<DesktopOverviewResponse> {
  const model = await buildInstallPageModel(req, overview);
  return {
    overview: model.overview,
    publicBaseUrl: model.publicBaseUrl,
    dashboardUrl: model.dashboardUrl,
    installUrl: model.installUrl,
    qrUrl: `${model.publicBaseUrl}/install/qr.svg`,
    apkDownloadUrl: model.androidArtifact ? `${model.publicBaseUrl}/downloads/android/latest.apk` : null,
    androidArtifact: model.androidArtifact
      ? {
          fileName: model.androidArtifact.fileName,
          sizeBytes: model.androidArtifact.sizeBytes
        }
      : null
  };
}

export function renderDesktopPage(model: InstallPageModel): string {
  const { overview, dashboardUrl, installUrl, publicBaseUrl, qrSvg, androidArtifact } = model;
  const hostStatus = overview.hostStatus;
  const suggestedUrl = hostStatus?.tailscale.suggestedUrl ?? publicBaseUrl;
  const apkDownloadUrl = androidArtifact ? `${publicBaseUrl}/downloads/android/latest.apk` : null;
  const pairingCode = hostStatus?.host.pairingCode ?? "Waiting";
  const codexState = humanizeAuth(hostStatus?.auth.status ?? "logged_out");
  const codexDetail = hostStatus?.auth.detail ?? "Desktop host has not published Codex status yet.";
  const tailscaleState = hostStatus?.tailscale.connected ? "Tailscale ready" : "Tailscale needs attention";
  const tailscaleDetail = hostStatus?.tailscale.detail ?? "Waiting for Tailscale status.";
  const roots = hostStatus?.host.approvedRoots ?? [];
  const recentSessions = overview.recentSessions;
  const recentDevices = overview.recentDevices;

  return renderPage({
    title: "Adam Connect Desktop",
    description: "Launch, monitor, and pair Adam Connect from a clean desktop dashboard.",
    body: `
      <main class="shell">
        <section class="hero panel">
          <div class="hero-copy">
            <span class="eyebrow">Adam Connect Desktop</span>
            <h1>Launch once. Pair fast. Keep Codex on your own machine.</h1>
            <p class="lede">
              This desktop dashboard is the home base for the whole system. It keeps the local Codex login on the
              desktop, gives your phone a safe install path over Tailscale, and keeps the setup simple enough to use
              like a real app.
            </p>
            <div class="button-row">
              <a class="button button-primary" href="${escapeHtml(installUrl)}">Open Phone Install Page</a>
              ${
                apkDownloadUrl
                  ? `<a class="button button-secondary" href="${escapeHtml(apkDownloadUrl)}">Download Android APK</a>`
                  : `<span class="button button-muted">Android APK not built yet</span>`
              }
              <a class="button button-ghost" href="${escapeHtml(`${publicBaseUrl}/install/qr.svg`)}">Open QR Image</a>
            </div>
            <div class="status-row">
              <span class="pill pill-teal">${hostStatus?.host.isOnline ? "Host online" : "Host offline"}</span>
              <span class="pill pill-navy">${escapeHtml(codexState)}</span>
              <span class="pill pill-orange">${escapeHtml(tailscaleState)}</span>
            </div>
          </div>
          <div class="hero-side">
            <div class="callout">
              <span class="label">Current pairing code</span>
              <div class="code-line">
                <strong class="pair-code">${escapeHtml(pairingCode)}</strong>
                <button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy</button>
              </div>
              <p>Use this code from the phone app after entering the desktop URL.</p>
            </div>
            <div class="callout">
              <span class="label">Phone-safe desktop URL</span>
              <div class="stack gap-sm">
                <code>${escapeHtml(suggestedUrl)}</code>
                <button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy URL</button>
              </div>
              <p>The launcher and phone onboarding page both point here so the setup stays consistent.</p>
            </div>
          </div>
        </section>

        <section class="metrics">
          <article class="panel metric">
            <span class="label">Active chats</span>
            <strong>${hostStatus?.activeSessionCount ?? 0}</strong>
            <p>Current Codex runs that are still in flight.</p>
          </article>
          <article class="panel metric">
            <span class="label">Paired devices</span>
            <strong>${hostStatus?.pairedDeviceCount ?? 0}</strong>
            <p>Trusted phones connected to this desktop host.</p>
          </article>
          <article class="panel metric">
            <span class="label">Approved roots</span>
            <strong>${roots.length}</strong>
            <p>Workspaces the phone is allowed to target.</p>
          </article>
          <article class="panel metric">
            <span class="label">Android build</span>
            <strong>${androidArtifact ? "Ready" : "Missing"}</strong>
            <p>${
              androidArtifact
                ? `${escapeHtml(androidArtifact.fileName)}${androidArtifact.sizeBytes ? ` • ${escapeHtml(formatBytes(androidArtifact.sizeBytes))}` : ""}`
                : "Build once and the download button lights up automatically."
            }</p>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Phone onboarding</span>
                <h2>Install and pair in one place</h2>
              </div>
              <a class="text-link" href="${escapeHtml(installUrl)}">Open phone page</a>
            </div>
            <div class="qr-box">${qrSvg}</div>
            <p class="muted">
              Scan this from your phone to open the install page directly. That page includes the APK download, desktop
              URL, and pairing flow.
            </p>
            <code>${escapeHtml(installUrl)}</code>
          </article>

          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Desktop status</span>
                <h2>Health and readiness</h2>
              </div>
            </div>
            <div class="stack gap-md">
              <div class="status-card">
                <strong>${escapeHtml(codexState)}</strong>
                <p>${escapeHtml(codexDetail)}</p>
              </div>
              <div class="status-card">
                <strong>${escapeHtml(tailscaleState)}</strong>
                <p>${escapeHtml(tailscaleDetail)}</p>
              </div>
              <div class="status-card">
                <strong>Local dashboard</strong>
                <p>Open <code>${escapeHtml(dashboardUrl)}</code> on this desktop any time to get back here.</p>
              </div>
            </div>
          </article>
        </section>

        <section class="content-grid wide">
          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Recent chats</span>
                <h2>See what the phone has been working on</h2>
              </div>
            </div>
            ${
              recentSessions.length
                ? `<div class="list-grid">${recentSessions.map(renderSessionCard).join("")}</div>`
                : `<div class="empty-state">No chat sessions yet. Pair the phone, start a chat, and it will show up here.</div>`
            }
          </article>

          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Approved roots</span>
                <h2>Desktop workspaces exposed to the phone</h2>
              </div>
            </div>
            ${
              roots.length
                ? `<div class="stack gap-sm">${roots
                    .map(
                      (root) =>
                        `<div class="token-row"><code>${escapeHtml(root)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(root)}">Copy</button></div>`
                    )
                    .join("")}</div>`
                : `<div class="empty-state">No approved roots have been registered yet.</div>`
            }
          </article>
        </section>

        <section class="content-grid wide">
          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Trusted phones</span>
                <h2>Recent paired devices</h2>
              </div>
            </div>
            ${
              recentDevices.length
                ? `<div class="list-grid compact">${recentDevices
                    .map(
                      (device) => `
                        <div class="list-card">
                          <strong>${escapeHtml(device.deviceName)}</strong>
                          <p>Last seen ${escapeHtml(timeAgo(device.lastSeenAt))}</p>
                          <span class="micro">${escapeHtml(device.id)}</span>
                        </div>
                      `
                    )
                    .join("")}</div>`
                : `<div class="empty-state">No phone has paired yet.</div>`
            }
          </article>

          <article class="panel section">
            <div class="section-head">
              <div>
                <span class="label">Quick start</span>
                <h2>Use it like an app</h2>
              </div>
            </div>
            <ol class="steps">
              <li>Run <code>npm run launch</code> from this repo.</li>
              <li>Keep this page open while the desktop host runs.</li>
              <li>Scan the QR code or open the phone install page over Tailscale.</li>
              <li>Install the Android APK, pair with the code, then chat.</li>
            </ol>
            <p class="muted">
              This dashboard refreshes automatically every 10 seconds so the pairing code, health, and chat activity stay current.
            </p>
          </article>
        </section>
      </main>
    `
  });
}

export function renderInstallPage(model: InstallPageModel): string {
  const { overview, publicBaseUrl, installUrl, androidArtifact } = model;
  const hostStatus = overview.hostStatus;
  const suggestedUrl = hostStatus?.tailscale.suggestedUrl ?? publicBaseUrl;
  const apkDownloadUrl = androidArtifact ? `${publicBaseUrl}/downloads/android/latest.apk` : null;
  const pairingCode = hostStatus?.host.pairingCode ?? "Waiting";
  const authLabel = humanizeAuth(hostStatus?.auth.status ?? "logged_out");

  return renderPage({
    title: "Install Adam Connect",
    description: "Phone setup page for Adam Connect over Tailscale.",
    body: `
      <main class="shell narrow">
        <section class="hero panel compact-hero">
          <div class="hero-copy">
            <span class="eyebrow">Phone setup</span>
            <h1>Install Adam Connect on your phone.</h1>
            <p class="lede">
              This page is designed to be easy to open from a phone. Download the Android APK, then pair the app to
              your desktop using the same URL and pairing code shown below.
            </p>
            <div class="button-row">
              ${
                apkDownloadUrl
                  ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}">Download Android APK</a>`
                  : `<span class="button button-muted">Android APK not available yet</span>`
              }
              <a class="button button-secondary" href="${escapeHtml(publicBaseUrl)}">Back to Desktop Dashboard</a>
            </div>
          </div>
        </section>

        <section class="content-grid single">
          <article class="panel section">
            <span class="label">Step 1</span>
            <h2>Use this desktop URL in the app</h2>
            <div class="token-row">
              <code>${escapeHtml(suggestedUrl)}</code>
              <button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy</button>
            </div>
            <p class="muted">Paste this into the Adam Connect app after installation.</p>
          </article>

          <article class="panel section">
            <span class="label">Step 2</span>
            <h2>Enter this pairing code</h2>
            <div class="token-row emphasized">
              <strong class="pair-code">${escapeHtml(pairingCode)}</strong>
              <button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy</button>
            </div>
            <p class="muted">The phone stores its own long-lived device token after pairing succeeds.</p>
          </article>

          <article class="panel section">
            <span class="label">Step 3</span>
            <h2>Confirm the desktop is ready</h2>
            <div class="stack gap-sm">
              <div class="status-card">
                <strong>${escapeHtml(authLabel)}</strong>
                <p>${escapeHtml(hostStatus?.auth.detail ?? "Waiting for desktop status.")}</p>
              </div>
              <div class="status-card">
                <strong>${hostStatus?.tailscale.connected ? "Tailscale connected" : "Tailscale check needed"}</strong>
                <p>${escapeHtml(hostStatus?.tailscale.detail ?? "Waiting for Tailscale status.")}</p>
              </div>
            </div>
          </article>

          <article class="panel section">
            <span class="label">Step 4</span>
            <h2>Start chatting</h2>
            <ol class="steps">
              <li>Open the Adam Connect app on Android.</li>
              <li>Enter the desktop URL and pairing code from this page.</li>
              <li>Create a chat from one of the approved workspace roots.</li>
              <li>Send a text prompt or use push-to-talk.</li>
            </ol>
            <p class="muted">This page refreshes automatically, so if the pairing code rotates you will see the new one here.</p>
          </article>

          <article class="panel section">
            <span class="label">Direct links</span>
            <h2>Handy URLs</h2>
            <div class="stack gap-sm">
              <div class="token-row"><code>${escapeHtml(installUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(installUrl)}">Copy</button></div>
              <div class="token-row"><code>${escapeHtml(`${publicBaseUrl}/install/qr.svg`)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(`${publicBaseUrl}/install/qr.svg`)}">Copy</button></div>
              ${
                apkDownloadUrl
                  ? `<div class="token-row"><code>${escapeHtml(apkDownloadUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(apkDownloadUrl)}">Copy</button></div>`
                  : ""
              }
            </div>
          </article>
        </section>
      </main>
    `
  });
}

export async function findAndroidArtifact(): Promise<AndroidArtifact | null> {
  const configuredPath = process.env.GATEWAY_ANDROID_APK_PATH?.trim();
  const candidates = configuredPath ? [configuredPath, ...defaultArtifactCandidates] : defaultArtifactCandidates;

  for (const candidate of candidates) {
    const filePath = path.resolve(repoRoot, candidate);
    try {
      await access(filePath);
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) {
        return {
          filePath,
          fileName: path.basename(filePath),
          sizeBytes: fileStat.size
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

function renderPage(input: { title: string; description: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
    <meta name="description" content="${escapeAttribute(input.description)}" />
    <style>
      :root {
        --navy-950: #11243e;
        --navy-800: #1b365d;
        --navy-600: #2b5b8c;
        --cream: #fdf8ef;
        --cream-strong: #f6efe1;
        --panel: rgba(255, 255, 255, 0.82);
        --line: rgba(17, 36, 62, 0.12);
        --text: #17304f;
        --muted: #52657f;
        --teal: #0f766e;
        --teal-soft: #d8fbf3;
        --orange: #d96b1c;
        --orange-soft: #ffedd8;
        --shadow: 0 20px 48px rgba(17, 36, 62, 0.14);
        --radius-xl: 30px;
        --radius-lg: 22px;
        --radius-md: 16px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: var(--text);
        font-family: "Inter", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(15, 118, 110, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(217, 107, 28, 0.16), transparent 24%),
          linear-gradient(180deg, #fffdf8 0%, #f1ebdf 100%);
      }

      a {
        color: inherit;
      }

      code {
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
        font-size: 0.96rem;
        word-break: break-word;
      }

      .shell {
        max-width: 1220px;
        margin: 0 auto;
        padding: 28px 18px 54px;
      }

      .shell.narrow {
        max-width: 900px;
      }

      .panel {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: var(--radius-xl);
        box-shadow: var(--shadow);
        backdrop-filter: blur(18px);
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.8fr);
        gap: 24px;
        padding: 28px;
        overflow: hidden;
        position: relative;
      }

      .hero::after {
        content: "";
        position: absolute;
        inset: auto -40px -80px auto;
        width: 260px;
        height: 260px;
        border-radius: 40px;
        background: linear-gradient(145deg, rgba(17, 36, 62, 0.14), rgba(15, 118, 110, 0.08));
        transform: rotate(18deg);
      }

      .compact-hero {
        grid-template-columns: 1fr;
      }

      .hero-copy,
      .hero-side {
        position: relative;
        z-index: 1;
      }

      .hero-side {
        display: grid;
        gap: 14px;
        align-content: start;
      }

      .eyebrow,
      .label {
        display: inline-flex;
        align-items: center;
        min-height: 30px;
        padding: 0 12px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--teal);
        font-size: 0.77rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 18px 0 12px;
        max-width: 12ch;
        font-size: clamp(2.5rem, 5vw, 4.9rem);
        line-height: 0.95;
      }

      h2 {
        margin: 10px 0 0;
        font-size: clamp(1.15rem, 2vw, 1.5rem);
      }

      .lede,
      .muted,
      .status-card p,
      .metric p,
      .callout p,
      .list-card p,
      .empty-state {
        color: var(--muted);
        line-height: 1.65;
      }

      .button-row,
      .status-row,
      .metrics,
      .content-grid,
      .stack,
      .list-grid {
        display: flex;
      }

      .button-row,
      .status-row {
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 22px;
      }

      .button,
      .icon-button,
      .text-link {
        transition: transform 160ms ease, opacity 160ms ease, background 160ms ease, color 160ms ease;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 18px;
        border-radius: 999px;
        font-weight: 700;
        text-decoration: none;
      }

      .button:hover,
      .icon-button:hover,
      .text-link:hover {
        transform: translateY(-1px);
      }

      .button-primary {
        color: #fff;
        background: linear-gradient(135deg, var(--navy-950), var(--navy-800));
      }

      .button-secondary {
        color: var(--navy-800);
        background: #e5eef9;
      }

      .button-ghost {
        color: var(--orange);
        background: var(--orange-soft);
      }

      .button-muted {
        color: var(--muted);
        background: rgba(82, 101, 127, 0.12);
        cursor: default;
      }

      .pill {
        display: inline-flex;
        align-items: center;
        min-height: 36px;
        padding: 0 14px;
        border-radius: 999px;
        font-weight: 700;
      }

      .pill-teal {
        background: var(--teal-soft);
        color: var(--teal);
      }

      .pill-navy {
        background: #dfe9f8;
        color: var(--navy-800);
      }

      .pill-orange {
        background: var(--orange-soft);
        color: var(--orange);
      }

      .callout,
      .status-card,
      .list-card,
      .token-row,
      .empty-state {
        background: rgba(255, 255, 255, 0.72);
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
      }

      .callout,
      .status-card,
      .empty-state {
        padding: 16px 18px;
      }

      .code-line,
      .token-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-top: 10px;
      }

      .token-row {
        padding: 14px 16px;
      }

      .token-row.emphasized {
        background: linear-gradient(135deg, rgba(17, 36, 62, 0.08), rgba(15, 118, 110, 0.08));
      }

      .pair-code {
        font-size: clamp(2rem, 4vw, 3rem);
        letter-spacing: 0.18em;
      }

      .icon-button {
        border: 0;
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(17, 36, 62, 0.1);
        color: var(--navy-950);
        cursor: pointer;
        font-weight: 700;
      }

      .metrics {
        gap: 16px;
        flex-wrap: wrap;
        margin-top: 18px;
      }

      .metric {
        flex: 1 1 220px;
        padding: 18px 20px;
      }

      .metric strong {
        display: block;
        margin-top: 12px;
        font-size: 2rem;
      }

      .content-grid {
        gap: 18px;
        margin-top: 18px;
        flex-wrap: wrap;
      }

      .content-grid.single > * {
        flex: 1 1 100%;
      }

      .content-grid.wide > :first-child {
        flex: 2 1 520px;
      }

      .content-grid.wide > :last-child {
        flex: 1 1 340px;
      }

      .content-grid > * {
        flex: 1 1 360px;
      }

      .section {
        padding: 22px;
      }

      .section-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
      }

      .text-link {
        color: var(--navy-800);
        font-weight: 700;
        text-decoration: none;
      }

      .qr-box {
        display: grid;
        place-items: center;
        margin: 18px 0 14px;
        padding: 20px;
        border-radius: 26px;
        background: rgba(253, 248, 239, 0.95);
        border: 1px solid var(--line);
      }

      .qr-box svg {
        width: min(100%, 280px);
        height: auto;
      }

      .list-grid {
        gap: 14px;
        flex-direction: column;
        margin-top: 16px;
      }

      .list-grid.compact {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .list-card {
        padding: 16px 18px;
      }

      .list-card strong {
        display: block;
        font-size: 1.05rem;
      }

      .micro {
        display: inline-block;
        margin-top: 8px;
        color: var(--muted);
        font-size: 0.8rem;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      }

      .status-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .steps {
        margin: 14px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.75;
      }

      .gap-sm {
        gap: 10px;
      }

      .gap-md {
        gap: 14px;
      }

      .stack {
        flex-direction: column;
      }

      .toast {
        position: fixed;
        right: 18px;
        bottom: 18px;
        padding: 12px 14px;
        border-radius: 14px;
        background: rgba(17, 36, 62, 0.9);
        color: #fff;
        font-weight: 700;
        opacity: 0;
        transform: translateY(12px);
        transition: opacity 180ms ease, transform 180ms ease;
        pointer-events: none;
      }

      .toast.visible {
        opacity: 1;
        transform: translateY(0);
      }

      @media (max-width: 940px) {
        .hero {
          grid-template-columns: 1fr;
        }

        h1 {
          max-width: none;
        }
      }

      @media (max-width: 640px) {
        .shell {
          padding: 18px 12px 36px;
        }

        .hero,
        .section {
          padding: 18px;
        }

        .code-line,
        .token-row,
        .section-head,
        .status-line {
          align-items: flex-start;
          flex-direction: column;
        }

        .pair-code {
          letter-spacing: 0.12em;
        }
      }
    </style>
  </head>
  <body>
    ${input.body}
    <div class="toast" id="toast">Copied</div>
    <script>
      const toast = document.getElementById("toast");
      let toastTimer;
      const showToast = (message) => {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
      };
      document.querySelectorAll("[data-copy]").forEach((button) => {
        button.addEventListener("click", async () => {
          const value = button.getAttribute("data-copy") || "";
          try {
            await navigator.clipboard.writeText(value);
            showToast("Copied to clipboard");
          } catch {
            showToast("Copy failed");
          }
        });
      });
      setTimeout(() => window.location.reload(), 10000);
    </script>
  </body>
</html>`;
}

function renderSessionCard(session: ChatSession): string {
  return `
    <div class="list-card">
      <div class="status-line">
        <strong>${escapeHtml(session.title)}</strong>
        <span class="pill ${sessionPillClass(session.status)}">${escapeHtml(humanizeSessionStatus(session.status))}</span>
      </div>
      <p>${escapeHtml(session.rootPath)}</p>
      <span class="micro">Updated ${escapeHtml(timeAgo(session.updatedAt))}</span>
    </div>
  `;
}

function resolvePublicBaseUrl(req: IncomingMessage, overview: GatewayOverview): string {
  const suggestedUrl = overview.hostStatus?.tailscale.suggestedUrl;
  if (suggestedUrl) {
    return stripTrailingSlash(suggestedUrl);
  }

  const hostHeader = req.headers.host ?? "127.0.0.1:43111";
  return `http://${stripTrailingSlash(hostHeader)}`;
}

function humanizeAuth(value: string): string {
  if (value === "logged_in") {
    return "Codex ready";
  }
  if (value === "error") {
    return "Codex needs attention";
  }
  return "Codex login required";
}

function humanizeSessionStatus(value: ChatSession["status"]): string {
  if (value === "queued") {
    return "Queued";
  }
  if (value === "running") {
    return "Running";
  }
  if (value === "stopping") {
    return "Stopping";
  }
  if (value === "error") {
    return "Needs attention";
  }
  return "Idle";
}

function sessionPillClass(value: ChatSession["status"]): string {
  if (value === "running") {
    return "pill-teal";
  }
  if (value === "queued" || value === "stopping") {
    return "pill-orange";
  }
  if (value === "error") {
    return "pill-navy";
  }
  return "pill-navy";
}

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function timeAgo(value: string): string {
  const deltaMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(deltaMs)) {
    return value;
  }

  const seconds = Math.max(1, Math.round(deltaMs / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}
