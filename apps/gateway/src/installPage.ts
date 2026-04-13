import { access, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import type { ChatMessage, ChatSession, DesktopOverviewResponse, GatewayOverview, RecentSessionActivity } from "@adam-connect/shared";

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
  const recentSessionActivity = overview.recentSessionActivity;
  const recentDevices = overview.recentDevices;
  const auditEvents = overview.auditEvents;

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
              <a class="button button-primary" href="#phone-setup" data-tab-open="phone-setup">Open Phone Setup</a>
              ${
                apkDownloadUrl
                  ? `<a class="button button-secondary" href="${escapeHtml(apkDownloadUrl)}" target="_blank" rel="noreferrer">Download Android APK</a>`
                  : `<span class="button button-muted">Android APK not built yet</span>`
              }
              <a class="button button-ghost" href="#phone-setup" data-tab-open="phone-setup">Show QR In App</a>
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

        <section class="tab-shell">
          <nav class="tab-bar panel" aria-label="Desktop functions" role="tablist">
            ${renderDesktopTabButton("operator", "Operator", true)}
            ${renderDesktopTabButton("phone-setup", "Phone Setup")}
            ${renderDesktopTabButton("activity", "Activity")}
            ${renderDesktopTabButton("devices", "Devices")}
            ${renderDesktopTabButton("workspaces", "Workspaces")}
            ${renderDesktopTabButton("settings", "Settings")}
          </nav>

          <div class="tab-panel active" data-tab-panel="operator" role="tabpanel" aria-labelledby="tab-operator">
            <section class="content-grid wide">
              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Operator Home</span>
                    <h2>Keep the operator loop healthy</h2>
                  </div>
                </div>
                <div class="stack gap-md">
                  <div class="status-card">
                    <strong>${escapeHtml(humanizeAvailability(hostStatus?.availability ?? "needs_attention"))}</strong>
                    <p>The native shell is now the supported desktop home. Use this view to monitor readiness, recovery, and quick phone onboarding.</p>
                  </div>
                  <div class="status-card">
                    <strong>Current run state: ${escapeHtml(humanizeRunState(hostStatus?.runState ?? "ready"))}</strong>
                    <p>${escapeHtml(codexDetail)}</p>
                  </div>
                  <div class="status-card">
                    <strong>Repair state: ${escapeHtml(humanizeRepairState(hostStatus?.repairState ?? "healthy"))}</strong>
                    <p>${escapeHtml(tailscaleDetail)}</p>
                  </div>
                </div>
              </article>

              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Quick Actions</span>
                    <h2>Open the phone, pair fast, recover cleanly</h2>
                  </div>
                </div>
                <div class="stack gap-sm">
                  <div class="token-row"><code>${escapeHtml(suggestedUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy Mobile URL</button></div>
                  <div class="token-row emphasized"><strong class="pair-code">${escapeHtml(pairingCode)}</strong><button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy Pairing Code</button></div>
                  <div class="button-row">
                    <a class="button button-primary" href="#phone-setup" data-tab-open="phone-setup">Open Phone Setup Tab</a>
                    <a class="button button-secondary" href="${escapeHtml(installUrl)}" target="_blank" rel="noreferrer">Open Recovery Page</a>
                  </div>
                  <div class="inline-qr-card">
                    <div>
                      <strong>Quick scan from this screen</strong>
                      <p>Scan this from the phone without leaving the desktop app.</p>
                    </div>
                    <div class="qr-box qr-box-compact" aria-label="Adam Connect phone setup QR code">
                      ${qrSvg}
                    </div>
                  </div>
                </div>
              </article>
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="phone-setup" role="tabpanel" aria-labelledby="tab-phone-setup" hidden>
            <section class="content-grid wide">
              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Phone Setup</span>
                    <h2>Pair the phone without leaving Adam Connect</h2>
                  </div>
                </div>
                <div class="stack gap-md">
                  <div class="token-row"><code>${escapeHtml(suggestedUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy Mobile URL</button></div>
                  <div class="token-row emphasized"><strong class="pair-code">${escapeHtml(pairingCode)}</strong><button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy Pairing Code</button></div>
                  <div class="status-card">
                    <strong>Fast path</strong>
                    <p>Open the app on the phone, scan the QR or paste the URL, then enter the pairing code shown here.</p>
                  </div>
                  <div class="button-row">
                    ${
                      apkDownloadUrl
                        ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}" target="_blank" rel="noreferrer">Download Android APK</a>`
                        : `<span class="button button-muted">Android APK not built yet</span>`
                    }
                    <a class="button button-secondary" href="${escapeHtml(installUrl)}" target="_blank" rel="noreferrer">Open Recovery Page</a>
                  </div>
                </div>
              </article>

              <article class="panel section qr-panel">
                <div class="section-head">
                  <div>
                    <span class="label">QR Code</span>
                    <h2>Scan this from the phone</h2>
                  </div>
                </div>
                <div class="qr-box qr-box-large" aria-label="Adam Connect phone setup QR code">
                  ${qrSvg}
                </div>
                <p class="muted">This QR opens the install page using the same Tailscale desktop address shown in the app.</p>
              </article>
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="activity" role="tabpanel" aria-labelledby="tab-activity" hidden>
            <section class="content-grid">
              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Recent Chats</span>
                    <h2>See what Codex and the phone have been doing</h2>
                  </div>
                </div>
                ${
                  recentSessionActivity.length
                    ? `<div class="list-grid">${recentSessionActivity.map(renderSessionCard).join("")}</div>`
                    : `<div class="empty-state">No chat sessions yet. Pair the phone, start a chat, and it will show up here.</div>`
                }
              </article>

              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Audit Timeline</span>
                    <h2>Repairs, runs, and device activity</h2>
                  </div>
                </div>
                ${
                  auditEvents.length
                    ? `<div class="list-grid compact">${auditEvents.map(renderAuditCard).join("")}</div>`
                    : `<div class="empty-state">No operator events have been recorded yet.</div>`
                }
              </article>
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="workspaces" role="tabpanel" aria-labelledby="tab-workspaces" hidden>
            <section class="content-grid single">
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
          </div>

          <div class="tab-panel" data-tab-panel="devices" role="tabpanel" aria-labelledby="tab-devices" hidden>
            <section class="content-grid single">
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
                              <p>Repair count ${device.repairCount} · ${device.pushToken ? "Push ready" : "Push not set"}</p>
                              <span class="micro">${escapeHtml(device.id)}</span>
                            </div>
                          `
                        )
                        .join("")}</div>`
                    : `<div class="empty-state">No phone has paired yet.</div>`
                }
              </article>
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
            <section class="content-grid wide">
              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Desktop Settings</span>
                    <h2>Health, transport, and launch behavior</h2>
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
                    <strong>Transport security: ${escapeHtml(hostStatus?.tailscale.transportSecurity ?? "unknown")}</strong>
                    <p>Adam Connect is tailnet-first. If secure transport is unavailable, treat this machine as needing attention until transport is upgraded.</p>
                  </div>
                </div>
              </article>

              <article class="panel section">
                <div class="section-head">
                  <div>
                    <span class="label">Support Surfaces</span>
                    <h2>Fallback links and packaging</h2>
                  </div>
                </div>
                <div class="stack gap-sm">
                  <div class="token-row"><code>${escapeHtml(dashboardUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(dashboardUrl)}">Copy Shell URL</button></div>
                  <div class="token-row"><code>${escapeHtml(installUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(installUrl)}">Copy Install Page</button></div>
                  ${
                    apkDownloadUrl
                      ? `<div class="token-row"><code>${escapeHtml(apkDownloadUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(apkDownloadUrl)}">Copy APK</button></div>`
                      : `<div class="empty-state">Android APK not built yet.</div>`
                  }
                </div>
              </article>
            </section>
          </div>
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
                  ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}" target="_blank" rel="noreferrer">Download Android APK</a>`
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
            <p class="muted">The phone stores its own long-lived device token after pairing succeeds, and this code stays stable across normal desktop restarts.</p>
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
              <li>Enter the desktop URL and pairing code from this page. The QR code is optional convenience only.</li>
              <li>Let the default <code>Operator</code> chat restore first, or create a named project chat when you need a separate thread.</li>
              <li>Send a text prompt or use <code>Talk To Codex</code>.</li>
            </ol>
            <p class="muted">Keep this URL handy for remote recovery. You only need the code again if you set up a new phone or reinstall the app.</p>
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
        font-size: 0.88rem;
        word-break: break-word;
      }

      .shell {
        max-width: 1220px;
        margin: 0 auto;
        padding: 20px 16px 38px;
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
        gap: 18px;
        padding: 22px;
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
        min-height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(15, 118, 110, 0.12);
        color: var(--teal);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 14px 0 10px;
        max-width: 12ch;
        font-size: clamp(1.95rem, 3.2vw, 3.2rem);
        line-height: 1;
      }

      h2 {
        margin: 10px 0 0;
        font-size: clamp(1rem, 1.4vw, 1.25rem);
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
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 18px;
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
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        font-weight: 700;
        text-decoration: none;
        font-size: 0.92rem;
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
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 0.86rem;
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
        padding: 14px 16px;
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
        padding: 12px 14px;
      }

      .token-row.emphasized {
        background: linear-gradient(135deg, rgba(17, 36, 62, 0.08), rgba(15, 118, 110, 0.08));
      }

      .pair-code {
        font-size: clamp(1.5rem, 2.6vw, 2.2rem);
        letter-spacing: 0.18em;
      }

      .icon-button {
        border: 0;
        border-radius: 999px;
        min-height: 34px;
        padding: 0 12px;
        background: rgba(17, 36, 62, 0.1);
        color: var(--navy-950);
        cursor: pointer;
        font-weight: 700;
        font-size: 0.84rem;
      }

      .metrics {
        gap: 12px;
        flex-wrap: wrap;
        margin-top: 14px;
      }

      .metric {
        flex: 1 1 220px;
        padding: 16px 18px;
      }

      .metric strong {
        display: block;
        margin-top: 10px;
        font-size: 1.55rem;
      }

      .content-grid {
        gap: 14px;
        margin-top: 14px;
        flex-wrap: wrap;
        align-items: stretch;
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

      .tab-shell {
        margin-top: 14px;
      }

      .tab-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 10px;
      }

      .tab-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(17, 36, 62, 0.08);
        color: var(--navy-800);
        cursor: pointer;
        font-weight: 800;
        font-size: 0.9rem;
      }

      .tab-button.active {
        color: #fff;
        background: linear-gradient(135deg, var(--navy-950), var(--navy-800));
      }

      .tab-panel {
        margin-top: 14px;
        min-height: clamp(320px, 44vh, 720px);
      }

      .tab-panel[hidden] {
        display: none;
      }

      .section {
        padding: 18px;
        height: 100%;
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
        margin: 14px 0 12px;
        padding: 16px;
        border-radius: 22px;
        background: rgba(253, 248, 239, 0.95);
        border: 1px solid var(--line);
      }

      .qr-box svg {
        width: min(100%, 280px);
        height: auto;
      }

      .inline-qr-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 14px 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius-lg);
        background: rgba(255, 255, 255, 0.72);
      }

      .qr-box-compact {
        margin: 0;
        padding: 8px;
        min-width: 116px;
      }

      .qr-box-compact svg {
        width: 104px;
      }

      .qr-box-large svg {
        width: min(100%, 320px);
      }

      .qr-panel {
        display: flex;
        flex-direction: column;
      }

      .list-grid {
        gap: 12px;
        flex-direction: column;
        margin-top: 14px;
      }

      .list-grid.compact {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      }

      .list-card {
        padding: 14px 16px;
      }

      .list-card.chat-activity {
        padding: 16px;
      }

      .list-card strong {
        display: block;
        font-size: 0.98rem;
      }

      .message-stack {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }

      .message-preview {
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.78);
      }

      .message-preview.user {
        background: rgba(229, 238, 249, 0.68);
      }

      .message-preview.assistant {
        background: rgba(216, 251, 243, 0.52);
      }

      .preview-label {
        display: inline-block;
        color: var(--navy-800);
        font-size: 0.72rem;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .preview-text {
        margin: 6px 0 0;
        color: var(--text);
        line-height: 1.45;
        font-size: 0.92rem;
      }

      .preview-text.empty {
        color: var(--muted);
      }

      .error-note {
        margin-top: 10px;
        padding: 9px 10px;
        border-radius: 14px;
        background: rgba(217, 107, 28, 0.12);
        color: var(--orange);
        font-weight: 700;
        font-size: 0.88rem;
      }

      .micro {
        display: inline-block;
        margin-top: 6px;
        color: var(--muted);
        font-size: 0.74rem;
        font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      }

      .status-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }

      .steps {
        margin: 12px 0 0;
        padding-left: 20px;
        color: var(--muted);
        line-height: 1.6;
        font-size: 0.94rem;
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
        .status-line,
        .inline-qr-card {
          align-items: flex-start;
          flex-direction: column;
        }

        .tab-bar {
          flex-direction: column;
        }

        .tab-button {
          width: 100%;
          justify-content: flex-start;
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
      const tabs = Array.from(document.querySelectorAll("[data-tab-target]"));
      const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
      const storageKey = "adam-connect-desktop-tab";
      const showToast = (message) => {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
      };
      const activateTab = (tabId) => {
        const targetId = tabs.some((button) => button.getAttribute("data-tab-target") === tabId)
          ? tabId
          : tabs[0]?.getAttribute("data-tab-target");
        if (!targetId) return;
        tabs.forEach((button) => {
          const active = button.getAttribute("data-tab-target") === targetId;
          button.classList.toggle("active", active);
          button.setAttribute("aria-selected", active ? "true" : "false");
          button.setAttribute("tabindex", active ? "0" : "-1");
        });
        panels.forEach((panel) => {
          const active = panel.getAttribute("data-tab-panel") === targetId;
          panel.classList.toggle("active", active);
          panel.toggleAttribute("hidden", !active);
        });
        try {
          localStorage.setItem(storageKey, targetId);
        } catch {}
      };
      tabs.forEach((button) => {
        button.addEventListener("click", () => activateTab(button.getAttribute("data-tab-target")));
      });
      document.querySelectorAll("[data-tab-open]").forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          const targetId = link.getAttribute("data-tab-open");
          if (!targetId) return;
          activateTab(targetId);
          window.location.hash = targetId;
        });
      });
      window.addEventListener("hashchange", () => {
        const targetId = window.location.hash.replace(/^#/, "");
        if (targetId) {
          activateTab(targetId);
        }
      });
      const initialTab =
        window.location.hash.replace(/^#/, "") ||
        (() => {
          try {
            return localStorage.getItem(storageKey) || "operator";
          } catch {
            return "operator";
          }
        })();
      activateTab(initialTab);
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
    </script>
  </body>
</html>`;
}

function renderDesktopTabButton(id: string, label: string, active = false): string {
  return `
    <button
      class="tab-button ${active ? "active" : ""}"
      id="tab-${escapeAttribute(id)}"
      type="button"
      role="tab"
      aria-selected="${active ? "true" : "false"}"
      tabindex="${active ? "0" : "-1"}"
      data-tab-target="${escapeAttribute(id)}"
    >
      ${escapeHtml(label)}
    </button>
  `;
}

function renderSessionCard(activity: RecentSessionActivity): string {
  const { session, latestUserMessage, latestAssistantMessage, lastMessageAt } = activity;
  const assistantPreview = session.lastError
    ? `Latest run stopped with an error: ${session.lastError}`
    : latestAssistantMessage?.content?.trim()
      ? latestAssistantMessage.content
      : session.status === "running" || session.status === "queued"
        ? "Codex is working on the latest turn."
        : "No assistant reply has landed yet.";
  return `
    <div class="list-card chat-activity">
      <div class="status-line">
        <div>
          <strong>${escapeHtml(session.title)}</strong>
          <span class="micro">${escapeHtml(session.rootPath)}</span>
        </div>
        <span class="pill ${sessionPillClass(session.status)}">${escapeHtml(humanizeSessionStatus(session.status))}</span>
      </div>
      <div class="message-stack">
        ${renderMessagePreview("Phone asked", latestUserMessage, "No user prompt has been captured yet.", "user")}
        ${renderMessagePreview("Codex replied", assistantPreview, "No assistant reply has landed yet.", "assistant")}
      </div>
      ${
        session.lastError
          ? `<div class="error-note">${escapeHtml(session.lastError)}</div>`
          : ""
      }
      <span class="micro">Updated ${escapeHtml(timeAgo(lastMessageAt ?? session.updatedAt))}</span>
    </div>
  `;
}

function renderMessagePreview(
  label: string,
  message: ChatMessage | string | null,
  emptyState: string,
  variant: "user" | "assistant"
): string {
  const content = typeof message === "string" ? message : message?.content ?? "";
  const value = content.trim() ? truncatePreview(content.trim()) : emptyState;
  const emptyClass = content.trim() ? "" : " empty";
  return `
    <div class="message-preview ${variant}">
      <span class="preview-label">${escapeHtml(label)}</span>
      <p class="preview-text${emptyClass}">${escapeHtml(value)}</p>
    </div>
  `;
}

function truncatePreview(value: string, maxLength = 220): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function renderAuditCard(event: DesktopOverviewResponse["overview"]["auditEvents"][number]): string {
  return `
    <div class="list-card">
      <strong>${escapeHtml(event.type.replace(/_/g, " "))}</strong>
      <p>${escapeHtml(event.detail ?? "No extra detail recorded.")}</p>
      <span class="micro">${escapeHtml(timeAgo(event.createdAt))}</span>
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

function humanizeAvailability(value: string): string {
  switch (value) {
    case "codex_unavailable":
      return "Codex unavailable";
    case "offline":
      return "Desktop offline";
    case "ready":
      return "Ready";
    case "reconnecting":
      return "Reconnecting";
    case "repair_needed":
      return "Repair needed";
    case "tailscale_unavailable":
      return "Tailscale unavailable";
    default:
      return "Needs attention";
  }
}

function humanizeRepairState(value: string): string {
  switch (value) {
    case "repair_required":
      return "Repair required";
    case "reconnecting":
      return "Reconnecting";
    case "repaired":
      return "Repaired";
    default:
      return "Healthy";
  }
}

function humanizeRunState(value: string): string {
  switch (value) {
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "sending":
      return "Sending";
    case "speaking":
      return "Speaking";
    case "stopping":
      return "Stopping";
    case "review":
      return "Review";
    case "listening":
      return "Listening";
    case "completed":
      return "Completed";
    default:
      return "Ready";
  }
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
