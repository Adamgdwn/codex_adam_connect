import { access, stat } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import type { ChatMessage, ChatSession, DesktopOverviewResponse, GatewayOverview, RecentSessionActivity } from "@adam-connect/shared";
import {
  FREEDOM_PRIMARY_SESSION_TITLE,
  FREEDOM_PRODUCT_NAME,
  FREEDOM_RUNTIME_NAME
} from "@adam-connect/shared";

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
  desktopConsoleEnabled: boolean;
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
    androidArtifact: await findAndroidArtifact(),
    desktopConsoleEnabled: isLoopbackRequest(req)
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
  const localBaseUrl = resolveLocalBaseUrl(req);
  return {
    overview: model.overview,
    publicBaseUrl: model.publicBaseUrl,
    dashboardUrl: `${localBaseUrl}/`,
    installUrl: model.installUrl,
    qrUrl: `${localBaseUrl}/install/qr.svg`,
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
  const { overview, dashboardUrl, installUrl, publicBaseUrl, qrSvg, androidArtifact, desktopConsoleEnabled } = model;
  const hostStatus = overview.hostStatus;
  const suggestedUrl = hostStatus?.tailscale.suggestedUrl ?? publicBaseUrl;
  const apkDownloadUrl = androidArtifact ? `${publicBaseUrl}/downloads/android/latest.apk` : null;
  const pairingCode = hostStatus?.host.pairingCode ?? "Waiting";
  const codexState = humanizeAuth(hostStatus?.auth.status ?? "logged_out");
  const codexDetail = hostStatus?.auth.detail ?? "Desktop host has not published Freedom runtime status yet.";
  const tailscaleState = hostStatus?.tailscale.connected ? "Tailscale ready" : "Tailscale needs attention";
  const tailscaleDetail = hostStatus?.tailscale.detail ?? "Waiting for Tailscale status.";
  const roots = hostStatus?.host.approvedRoots ?? [];
  const recentSessionActivity = overview.recentSessionActivity;
  const recentDevices = overview.recentDevices;
  const auditEvents = overview.auditEvents;
  const primaryActivity = recentSessionActivity[0] ?? null;
  const attentionEvents = auditEvents.filter((event) => /(approval|repair|failed|error)/i.test(event.type));
  const recentPartnerSummary = primaryActivity
    ? primaryActivity.latestAssistantMessage?.content?.trim() || primaryActivity.session.lastPreview || primaryActivity.session.title
    : "No active Freedom conversation yet. Pair the phone or open the desktop shell to begin.";
  const partnerPosture =
    hostStatus?.availability === "ready"
      ? "Freedom is online, paired, and ready to help run the day from desktop or phone."
      : "Freedom needs attention before it can act like a dependable partner across both surfaces.";

  return renderPage({
    title: "Freedom Desktop",
    description: "Launch, monitor, and pair Freedom from a clean desktop dashboard.",
    body: `
      <main class="shell shell-studio">
        <header class="studio-topbar panel">
          <div class="studio-brand">
            <span class="brand-mark">F</span>
            <div class="brand-copy">
              <strong>Freedom Engine</strong>
              <span>Desktop operator shell</span>
            </div>
          </div>
          <label class="studio-search">
            <span>Command</span>
            <input type="text" value="" placeholder="Search commands, projects, agents, memory, files..." readonly />
          </label>
          <div class="studio-top-status">
            <span class="pill pill-teal">${hostStatus?.host.isOnline ? "Host online" : "Host offline"}</span>
            <span class="pill pill-navy">${escapeHtml(codexState)}</span>
            <span class="pill pill-navy">${hostStatus?.activeSessionCount ?? 0} live</span>
            <span class="pill pill-navy">${hostStatus?.pairedDeviceCount ?? 0} mobile</span>
          </div>
        </header>

        <nav class="studio-nav panel" aria-label="Desktop functions" role="tablist">
          ${renderDesktopTabButton("workspaces", "Overview")}
          ${renderDesktopTabButton("operator", "Studio", true)}
          ${renderDesktopTabButton("projects", "Active Projects")}
          ${renderDesktopTabButton("build", "Build")}
          ${renderDesktopTabButton("phone-setup", "Connect")}
          ${renderDesktopTabButton("activity", "Activity")}
          ${renderDesktopTabButton("settings", "Settings")}
        </nav>

        <section class="tab-shell">
          <div class="tab-panel active" data-tab-panel="operator" role="tabpanel" aria-labelledby="tab-operator">
            <section class="studio-workspace">
              <aside class="studio-rail panel">
                <button class="studio-rail-button active" type="button" data-tab-open="operator" data-studio-open="desk">Home</button>
                <button class="studio-rail-button" type="button" data-tab-open="projects">Active Projects</button>
                <button class="studio-rail-button" type="button" data-tab-open="build">Build</button>
                <button class="studio-rail-button" type="button" data-tab-open="operator" data-studio-open="map">Memory</button>
                <button class="studio-rail-button" type="button" data-tab-open="phone-setup">Connect</button>
              </aside>

              <aside class="studio-sidebar panel">
                <details class="accordion-card" open>
                  <summary>Mission Brief</summary>
                  <div class="accordion-body">
                    <p>${escapeHtml(partnerPosture)}</p>
                    <p>${escapeHtml(recentPartnerSummary)}</p>
                  </div>
                </details>
                <details class="accordion-card" open>
                  <summary>Execution Signals</summary>
                  <div class="accordion-body stack gap-sm">
                    ${renderWorkbenchSignalCard("Run state", humanizeRunState(hostStatus?.runState ?? "ready"), `${humanizeRepairState(hostStatus?.repairState ?? "healthy")} · ${humanizeAvailability(hostStatus?.availability ?? "needs_attention")}`)}
                    ${renderWorkbenchSignalCard("Decision queue", `${attentionEvents.length} item${attentionEvents.length === 1 ? "" : "s"}`, attentionEvents.length ? "Approvals, repairs, or failures are waiting for review." : "No urgent approvals or failures are waiting right now.")}
                    ${renderWorkbenchSignalCard("Phone sync", `${recentDevices.length} trusted phone${recentDevices.length === 1 ? "" : "s"}`, recentDevices.length ? "Companion devices are attached to this desktop host." : "No phone is paired yet.")}
                  </div>
                </details>
                <details class="accordion-card">
                  <summary>Recent Threads</summary>
                  <div class="accordion-body stack gap-sm">
                    ${
                      recentSessionActivity.length
                        ? recentSessionActivity.slice(0, 4).map(renderWorkbenchSessionCard).join("")
                        : `<div class="empty-state">No active work threads yet.</div>`
                    }
                  </div>
                </details>
              </aside>

              <section class="studio-main panel">
                <div class="editor-tabs">
                  <button class="editor-tab active" type="button" data-studio-tab-target="desk">Partner Desk</button>
                  <button class="editor-tab" type="button" data-studio-tab-target="map">Mission Map</button>
                  <button class="editor-tab" type="button" data-studio-tab-target="ops">Ops Pulse</button>
                </div>

                <div class="studio-panel active" data-studio-panel="desk">
                  <div class="studio-stats-grid">
                    <div class="glow-card">
                      <span class="glow-label">Pairing</span>
                      <strong>${escapeHtml(pairingCode)}</strong>
                      <p>Current mobile companion code.</p>
                    </div>
                    <div class="glow-card">
                      <span class="glow-label">Companion URL</span>
                      <strong>${escapeHtml(truncatePreview(suggestedUrl, 28))}</strong>
                      <p>Shared mobile connection path.</p>
                    </div>
                    <div class="glow-card">
                      <span class="glow-label">Approvals</span>
                      <strong>${attentionEvents.length}</strong>
                      <p>Items waiting for a decision.</p>
                    </div>
                    <div class="glow-card">
                      <span class="glow-label">Roots</span>
                      <strong>${roots.length}</strong>
                      <p>Approved desktop workspaces.</p>
                    </div>
                  </div>

                  <div class="quick-prompt-row studio-prompt-row">
                    <button class="quick-prompt" type="button" data-partner-prompt="Give me the clearest picture of what matters most today across my active work.">Daily brief</button>
                    <button class="quick-prompt" type="button" data-partner-prompt="Review the current work and tell me what needs my decision next.">Needs decision</button>
                    <button class="quick-prompt" type="button" data-partner-prompt="Convert the current priorities into a practical execution plan with owners, dependencies, and risks.">Execution plan</button>
                    <button class="quick-prompt" type="button" data-partner-prompt="Challenge my current direction and tell me what I am underestimating.">Challenge me</button>
                  </div>

                  ${
                    desktopConsoleEnabled
                      ? `
                        <div
                          class="stack gap-md"
                          data-desktop-console
                          data-state-url="/api/desktop-shell/state"
                          data-session-url="/api/desktop-shell/session"
                          data-session-base="/api/desktop-shell/sessions"
                        >
                          <div class="partner-topline">
                            <div class="status-card partner-summary-card">
                              <strong id="partner-session-title">${escapeHtml(FREEDOM_PRIMARY_SESSION_TITLE)}</strong>
                              <p id="partner-session-meta">Opening the local partner desk on this desktop.</p>
                            </div>
                            <div class="partner-mini-metrics">
                              <div class="mini-kpi">
                                <span class="mini-kpi-label">Messages</span>
                                <strong id="partner-message-count">0</strong>
                              </div>
                              <div class="mini-kpi">
                                <span class="mini-kpi-label">Latest focus</span>
                                <strong id="partner-focus-summary">Loading</strong>
                              </div>
                            </div>
                          </div>
                          <div class="studio-console-shell">
                            <div class="partner-transcript" id="partner-messages">
                              <div class="empty-state">Loading the Freedom conversation on this desktop.</div>
                            </div>
                            <form class="partner-composer" id="partner-composer">
                              <label class="composer-label" for="partner-input">What should Freedom work on right now?</label>
                              <div class="command-bar-frame">
                                <textarea id="partner-input" rows="5" placeholder="Ask for priorities, a plan, a draft, a hard call, or the next concrete move."></textarea>
                                <div class="command-bar-help">
                                  <span>Compact command surface for strategy, approvals, planning, and execution.</span>
                                  <span class="keyboard-hint">Ctrl/Cmd + K</span>
                                </div>
                              </div>
                              <div class="button-row">
                                <button class="button button-primary" id="partner-send" type="submit">Send To Freedom</button>
                                <button class="button button-secondary" id="partner-stop" type="button">Stop Run</button>
                              </div>
                            </form>
                          </div>
                        </div>
                      `
                      : `
                        <div class="status-card">
                          <strong>Interactive partner controls are local-only</strong>
                          <p>This page is in read-only mode from a remote browser. Open the native Freedom Desktop shell on the computer itself to use the live partner conversation surface.</p>
                        </div>
                      `
                  }
                </div>

                <div class="studio-panel" data-studio-panel="map" hidden>
                  <div class="studio-grid-two">
                    <div class="glow-card glow-card-large">
                      <span class="glow-label">Mission map</span>
                      <strong>What Freedom is carrying</strong>
                      <p>${escapeHtml(recentPartnerSummary)}</p>
                    </div>
                    <div class="stack gap-sm">
                      ${renderWorkbenchSignalCard("Desktop readiness", codexState, codexDetail)}
                      ${renderWorkbenchSignalCard("Transport", hostStatus?.tailscale.connected ? "Tailscale ready" : "Needs attention", tailscaleDetail)}
                    </div>
                  </div>
                </div>

                <div class="studio-panel" data-studio-panel="ops" hidden>
                  <div class="studio-grid-two">
                    <div class="stack gap-sm">
                      ${
                        attentionEvents.length
                          ? attentionEvents.slice(0, 5).map(renderAttentionEventCard).join("")
                          : `<div class="empty-state">No urgent review items. Freedom is clear to keep executing.</div>`
                      }
                    </div>
                    <div class="stack gap-sm">
                      ${
                        recentSessionActivity.length
                          ? recentSessionActivity.slice(0, 4).map(renderWorkbenchSessionCard).join("")
                          : `<div class="empty-state">No recent session activity yet.</div>`
                      }
                    </div>
                  </div>
                </div>
              </section>

              <aside class="studio-inspector panel">
                <details class="accordion-card" open>
                  <summary>Connect</summary>
                  <div class="accordion-body stack gap-sm">
                    <div class="token-row"><code>${escapeHtml(suggestedUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy URL</button></div>
                    <div class="token-row emphasized"><strong class="pair-code">${escapeHtml(pairingCode)}</strong><button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy Code</button></div>
                    ${
                      apkDownloadUrl
                        ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}" download="freedom.apk">Download APK</a>`
                        : `<span class="button button-muted">Android APK not built yet</span>`
                    }
                  </div>
                </details>
                <details class="accordion-card" open>
                  <summary>Approved roots</summary>
                  <div class="accordion-body stack gap-sm">
                    ${
                      roots.length
                        ? roots.slice(0, 4).map(renderWorkspaceContextCard).join("")
                        : `<div class="empty-state">No approved roots yet.</div>`
                    }
                  </div>
                </details>
              </aside>
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="phone-setup" role="tabpanel" aria-labelledby="tab-phone-setup" hidden>
            <section class="content-grid single">
              ${renderAccordionPanel(
                "Mobile Connect",
                "Phone pairing, APK delivery, and recovery",
                `
                  <div class="stack gap-md">
                    <div class="token-row"><code>${escapeHtml(suggestedUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(suggestedUrl)}">Copy URL</button></div>
                    <div class="token-row emphasized"><strong class="pair-code">${escapeHtml(pairingCode)}</strong><button class="icon-button" type="button" data-copy="${escapeAttribute(pairingCode)}">Copy Code</button></div>
                    <details class="accordion-card" open>
                      <summary>Fast path</summary>
                      <div class="accordion-body">
                        <p>Open the app on the phone, paste the URL or scan the QR, then enter the current pairing code.</p>
                      </div>
                    </details>
                    <details class="accordion-card" open>
                      <summary>Install package</summary>
                      <div class="accordion-body stack gap-sm">
                        ${
                          apkDownloadUrl
                            ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}" download="freedom.apk">Download Android APK</a>`
                            : `<span class="button button-muted">Android APK not built yet</span>`
                        }
                        <a class="button button-secondary" href="${escapeHtml(installUrl)}" target="_blank" rel="noreferrer">Open Recovery Page</a>
                      </div>
                    </details>
                    <div class="qr-box qr-box-large" aria-label="Freedom phone setup QR code">${qrSvg}</div>
                  </div>
                `
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="activity" role="tabpanel" aria-labelledby="tab-activity" hidden>
            <section class="content-grid wide">
              ${renderAccordionPanel(
                "Recent Chats",
                "See what Freedom and the phone have been doing",
                recentSessionActivity.length
                  ? `<div class="list-grid">${recentSessionActivity.map(renderSessionCard).join("")}</div>`
                  : `<div class="empty-state">No chat sessions yet. Pair the phone, start a chat, and it will show up here.</div>`
              )}
              ${renderAccordionPanel(
                "Audit Timeline",
                "Repairs, runs, and device activity",
                auditEvents.length
                  ? `<div class="list-grid compact">${auditEvents.map(renderAuditCard).join("")}</div>`
                  : `<div class="empty-state">No operator events have been recorded yet.</div>`
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="workspaces" role="tabpanel" aria-labelledby="tab-workspaces" hidden>
            <section class="content-grid wide">
              ${renderAccordionPanel(
                "Overview",
                "Desktop posture, business state, and system summary",
                `
                  <details class="accordion-card" open>
                    <summary>Current posture</summary>
                    <div class="accordion-body">
                      <p>${escapeHtml(partnerPosture)}</p>
                      <p>${escapeHtml(codexDetail)}</p>
                    </div>
                  </details>
                  <details class="accordion-card" open>
                    <summary>System metrics</summary>
                    <div class="accordion-body stack gap-sm">
                      ${renderWorkbenchSignalCard("Run state", humanizeRunState(hostStatus?.runState ?? "ready"), `${humanizeRepairState(hostStatus?.repairState ?? "healthy")} · ${humanizeAvailability(hostStatus?.availability ?? "needs_attention")}`)}
                      ${renderWorkbenchSignalCard("Pairing", pairingCode, "Current mobile companion code for reconnect and onboarding.")}
                      ${renderWorkbenchSignalCard("Companion", hostStatus?.pairedDeviceCount === 1 ? "1 phone" : `${hostStatus?.pairedDeviceCount ?? 0} phones`, "Connected mobile companion devices.")}
                    </div>
                  </details>
                `
              )}
              ${renderAccordionPanel(
                "Workspaces",
                "Desktop workspaces exposed to the phone",
                roots.length
                  ? `<div class="stack gap-sm">${roots
                      .map(
                        (root) =>
                          `<div class="token-row"><code>${escapeHtml(root)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(root)}">Copy</button></div>`
                      )
                      .join("")}</div>`
                  : `<div class="empty-state">No approved roots have been registered yet.</div>`
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="projects" role="tabpanel" aria-labelledby="tab-projects" hidden>
            <section class="content-grid wide">
              ${renderAccordionPanel(
                "Active Projects",
                "Live work that Freedom is already carrying",
                recentSessionActivity.length
                  ? `<div class="list-grid">${recentSessionActivity.map(renderSessionCard).join("")}</div>`
                  : `<div class="empty-state">No active projects yet. Start one from Studio or Build and it will appear here.</div>`
              )}
              ${renderAccordionPanel(
                "Decision Queue",
                "Approvals, failures, repairs, and pending intervention",
                attentionEvents.length
                  ? `<div class="stack gap-sm">${attentionEvents.map(renderAttentionEventCard).join("")}</div>`
                  : `<div class="empty-state">Nothing urgent is waiting for review.</div>`
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="build" role="tabpanel" aria-labelledby="tab-build" hidden>
            <section class="content-grid wide">
              ${renderAccordionPanel(
                "Builder",
                "Tell Freedom what to build next",
                `
                  <details class="accordion-card" open>
                    <summary>Agent build actions</summary>
                    <div class="accordion-body stack gap-sm">
                      <button class="button button-primary" type="button" data-tab-open="operator" data-studio-open="desk" data-partner-prompt="Build a new agent for me. Start by asking the minimum clarifying questions, then produce the build brief, architecture, and first implementation plan.">Build New Agent</button>
                      <button class="button button-secondary" type="button" data-tab-open="operator" data-studio-open="desk" data-partner-prompt="Improve an existing Freedom agent. Review the current capability, identify gaps, and propose the next governed build iteration.">Improve Existing Agent</button>
                      <button class="button button-secondary" type="button" data-tab-open="operator" data-studio-open="desk" data-partner-prompt="Take an agent idea from concept to build brief. Define scope, interfaces, dependencies, validation, and the first execution steps.">Turn Idea Into Build Brief</button>
                    </div>
                  </details>
                  <details class="accordion-card" open>
                    <summary>What this build surface is for</summary>
                    <div class="accordion-body">
                      <p>Use this area when you want Freedom to design, plan, or execute a new agent build. The action buttons above drop you straight into the Studio command surface with a build-focused prompt.</p>
                    </div>
                  </details>
                `
              )}
              ${renderAccordionPanel(
                "Build Pipeline",
                "Projects, companion context, and readiness for agent work",
                `
                  <details class="accordion-card" open>
                    <summary>Current project load</summary>
                    <div class="accordion-body">
                      ${
                        recentSessionActivity.length
                          ? `<div class="list-grid compact">${recentSessionActivity.slice(0, 4).map(renderWorkbenchSessionCard).join("")}</div>`
                          : `<div class="empty-state">No current project threads yet.</div>`
                      }
                    </div>
                  </details>
                  <details class="accordion-card" open>
                    <summary>Connected devices</summary>
                    <div class="accordion-body">
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
                    </div>
                  </details>
                `
              )}
              ${renderAccordionPanel(
                "Build Notes",
                "Governed delivery reminders",
                `
                  <details class="accordion-card" open>
                    <summary>Current posture</summary>
                    <div class="accordion-body stack gap-sm">
                      ${renderWorkbenchSignalCard("Desktop readiness", codexState, codexDetail)}
                      ${renderWorkbenchSignalCard("Transport", hostStatus?.tailscale.connected ? "Ready" : "Needs attention", tailscaleDetail)}
                      ${renderWorkbenchSignalCard("Approved roots", `${roots.length}`, roots.length ? "Freedom has approved workspace context available for builds." : "Add approved roots so Freedom can execute against the right project folders.")}
                    </div>
                  </details>
                `
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="devices" role="tabpanel" aria-labelledby="tab-devices" hidden>
            <section class="content-grid single">
              ${renderAccordionPanel(
                "Trusted devices",
                "Recent paired phones and sync state",
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
              )}
            </section>
          </div>

          <div class="tab-panel" data-tab-panel="settings" role="tabpanel" aria-labelledby="tab-settings" hidden>
            <section class="content-grid wide">
              ${renderAccordionPanel(
                "Desktop settings",
                "Health, transport, and launch behavior",
                `
                  <details class="accordion-card" open>
                    <summary>Freedom auth</summary>
                    <div class="accordion-body">
                      <p>${escapeHtml(codexDetail)}</p>
                    </div>
                  </details>
                  <details class="accordion-card" open>
                    <summary>Transport</summary>
                    <div class="accordion-body">
                      <p>${escapeHtml(tailscaleDetail)}</p>
                      <p>Transport security: ${escapeHtml(hostStatus?.tailscale.transportSecurity ?? "unknown")}</p>
                    </div>
                  </details>
                `
              )}
              ${renderAccordionPanel(
                "Support surfaces",
                "Fallback links and packaging",
                `
                  <div class="stack gap-sm">
                    <div class="token-row"><code>${escapeHtml(dashboardUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(dashboardUrl)}">Copy Shell URL</button></div>
                    <div class="token-row"><code>${escapeHtml(installUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(installUrl)}">Copy Install Page</button></div>
                    ${
                      apkDownloadUrl
                        ? `<div class="token-row"><code>${escapeHtml(apkDownloadUrl)}</code><button class="icon-button" type="button" data-copy="${escapeAttribute(apkDownloadUrl)}">Copy APK</button></div>`
                        : `<div class="empty-state">Android APK not built yet.</div>`
                    }
                  </div>
                `
              )}
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
    title: "Install Freedom",
    description: "Phone setup page for Freedom over Tailscale.",
    body: `
      <main class="shell narrow">
        <section class="hero panel compact-hero">
          <div class="hero-copy">
            <span class="eyebrow">Phone setup</span>
            <h1>Install Freedom on your phone.</h1>
            <p class="lede">
              This page is designed to be easy to open from a phone. Download the Android APK, then pair the app to
              your desktop using the same URL and pairing code shown below.
            </p>
            <div class="button-row">
              ${
                apkDownloadUrl
                  ? `<a class="button button-primary" href="${escapeHtml(apkDownloadUrl)}" download="freedom.apk">Download Android APK</a>`
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
            <p class="muted">Paste this into the Freedom companion app after installation.</p>
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
              <li>Open the Freedom app on Android.</li>
              <li>Enter the desktop URL and pairing code from this page. The QR code is optional convenience only.</li>
              <li>Let the default <code>${escapeHtml(FREEDOM_PRIMARY_SESSION_TITLE)}</code> chat restore first, or create a named project chat when you need a separate thread.</li>
              <li>Send a text prompt or use voice to talk to Freedom.</li>
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
        --navy-950: #081224;
        --navy-900: #0d1b31;
        --navy-800: #132744;
        --navy-700: #1e416d;
        --navy-600: #2f6ea8;
        --panel: rgba(245, 249, 255, 0.88);
        --panel-strong: rgba(255, 255, 255, 0.94);
        --line: rgba(19, 39, 68, 0.12);
        --line-strong: rgba(89, 143, 204, 0.24);
        --text: #12233b;
        --muted: #556883;
        --teal: #1f8fa3;
        --teal-soft: rgba(72, 176, 214, 0.16);
        --orange: #5e89bb;
        --orange-soft: rgba(87, 130, 186, 0.16);
        --shadow: 0 18px 44px rgba(7, 21, 44, 0.14);
        --radius-xl: 14px;
        --radius-lg: 10px;
        --radius-md: 8px;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: var(--text);
        font-family: Calibri, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(64, 130, 210, 0.18), transparent 28%),
          radial-gradient(circle at top right, rgba(91, 181, 214, 0.14), transparent 24%),
          linear-gradient(180deg, #f7fbff 0%, #e6eef8 100%);
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

      .shell-app {
        max-width: 1440px;
      }

      .shell-studio {
        max-width: 1520px;
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

      .studio-topbar {
        display: grid;
        grid-template-columns: auto minmax(320px, 1fr) auto;
        gap: 14px;
        align-items: center;
        padding: 12px 16px;
      }

      .studio-brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 8px;
        background: linear-gradient(135deg, var(--navy-800), #51a8d0);
        color: #f8fbff;
        font-weight: 700;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
      }

      .brand-copy {
        display: grid;
        gap: 2px;
      }

      .brand-copy strong {
        font-size: 1rem;
      }

      .brand-copy span {
        color: var(--muted);
        font-size: 0.82rem;
      }

      .studio-search {
        display: grid;
        gap: 6px;
      }

      .studio-search span {
        color: var(--muted);
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .studio-search input {
        width: 100%;
        min-height: 40px;
        border-radius: 8px;
        border: 1px solid var(--line);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(231, 239, 249, 0.92));
        color: var(--text);
        padding: 0 14px;
        font: inherit;
      }

      .studio-top-status {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
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
        border-radius: 20px;
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
        border-radius: 6px;
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
        border-radius: 8px;
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
        background: linear-gradient(135deg, var(--navy-900), var(--navy-600));
      }

      .button-secondary {
        color: var(--navy-800);
        background: linear-gradient(180deg, #eaf1fb, #dbe7f5);
      }

      .button-ghost {
        color: var(--navy-700);
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
        border-radius: 8px;
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
        border-radius: 8px;
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

      .app-header {
        display: grid;
        grid-template-columns: minmax(0, 1.5fr) auto;
        gap: 18px;
        align-items: end;
        padding: 22px 24px;
      }

      .app-header-copy h1 {
        max-width: 15ch;
      }

      .app-header-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        justify-content: flex-end;
      }

      .command-ribbon {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }

      .ribbon-card {
        display: grid;
        gap: 10px;
        padding: 16px 18px;
      }

      .ribbon-card-wide {
        grid-column: span 2;
      }

      .ribbon-value {
        font-size: 1.8rem;
        line-height: 1;
        letter-spacing: 0.08em;
        color: var(--navy-950);
      }

      .ribbon-code {
        font-size: 1rem;
        color: var(--navy-950);
      }

      .ribbon-card p {
        margin: 0;
      }

      .studio-workspace {
        display: grid;
        grid-template-columns: 72px minmax(260px, 0.85fr) minmax(0, 1.8fr) minmax(280px, 0.95fr);
        gap: 12px;
        align-items: start;
      }

      .studio-rail,
      .studio-sidebar,
      .studio-main,
      .studio-inspector {
        min-height: calc(100vh - 220px);
      }

      .studio-rail {
        display: grid;
        align-content: start;
        gap: 8px;
        padding: 10px;
      }

      .studio-rail-button {
        min-height: 52px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .studio-rail-button.active {
        color: #f8fbff;
        background: linear-gradient(135deg, var(--navy-800), var(--navy-600));
      }

      .studio-sidebar,
      .studio-inspector {
        display: grid;
        align-content: start;
        gap: 10px;
        padding: 12px;
      }

      .accordion-card {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel-strong);
        overflow: hidden;
      }

      .accordion-card summary {
        list-style: none;
        cursor: pointer;
        padding: 14px 16px;
        font-weight: 700;
        color: var(--navy-900);
      }

      .accordion-card summary::-webkit-details-marker {
        display: none;
      }

      .accordion-body {
        padding: 0 16px 16px;
      }

      .studio-main {
        padding: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at top right, rgba(79, 184, 227, 0.22), transparent 28%),
          linear-gradient(180deg, rgba(13, 27, 49, 0.98), rgba(18, 35, 59, 0.98));
        border-color: rgba(98, 170, 224, 0.18);
      }

      .editor-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 10px 12px;
        border-bottom: 1px solid rgba(134, 173, 219, 0.14);
        background: rgba(4, 11, 24, 0.3);
      }

      .editor-tab {
        min-height: 38px;
        border-radius: 6px 6px 0 0;
        border: 1px solid transparent;
        background: rgba(118, 148, 191, 0.12);
        color: rgba(230, 240, 255, 0.72);
        padding: 0 14px;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .editor-tab.active {
        background: rgba(15, 33, 58, 0.88);
        color: #eff7ff;
        border-color: rgba(128, 193, 233, 0.2);
      }

      .studio-panel {
        display: grid;
        gap: 16px;
        padding: 16px;
      }

      .studio-stats-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }

      .glow-card {
        padding: 16px;
        border-radius: 10px;
        border: 1px solid rgba(123, 180, 224, 0.16);
        background: linear-gradient(180deg, rgba(18, 35, 59, 0.82), rgba(12, 24, 41, 0.92));
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 0 28px rgba(47, 124, 198, 0.12);
      }

      .glow-card strong {
        display: block;
        margin-top: 10px;
        color: #f0f7ff;
        font-size: 1.2rem;
      }

      .glow-card p,
      .glow-label {
        color: rgba(216, 230, 247, 0.74);
      }

      .glow-label {
        font-size: 0.76rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .glow-card-large {
        min-height: 220px;
      }

      .studio-console-shell {
        display: grid;
        grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.95fr);
        gap: 14px;
        align-items: start;
      }

      .studio-grid-two {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
        gap: 14px;
      }

      .workbench-grid {
        display: grid;
        grid-template-columns: minmax(240px, 0.9fr) minmax(0, 1.7fr) minmax(280px, 1fr);
        gap: 14px;
        margin-top: 14px;
        align-items: start;
      }

      .workbench-column,
      .workbench-main {
        display: grid;
        gap: 14px;
      }

      .workbench-main {
        min-width: 0;
      }

      .workbench-command {
        overflow: hidden;
        position: relative;
      }

      .workbench-command::after {
        content: "";
        position: absolute;
        right: -80px;
        top: -80px;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(15, 118, 110, 0.16), transparent 68%);
        pointer-events: none;
      }

      .workbench-stat-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 16px;
      }

      .mini-stat,
      .mini-kpi {
        border: 1px solid var(--line);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.76);
        padding: 14px 16px;
      }

      .mini-stat strong,
      .mini-kpi strong {
        display: block;
        margin-top: 8px;
        font-size: 1.24rem;
        color: var(--navy-950);
      }

      .mini-stat p {
        margin: 8px 0 0;
        font-size: 0.9rem;
      }

      .mini-stat-label,
      .mini-kpi-label {
        color: var(--muted);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .workbench-shortcuts {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 16px;
      }

      .tab-shell {
        margin-top: 14px;
      }

      .tab-bar {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        padding: 8px;
      }

      .tab-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 8px;
        min-height: 40px;
        padding: 0 14px;
        background: transparent;
        color: var(--muted);
        cursor: pointer;
        font-weight: 800;
        font-size: 0.94rem;
      }

      .tab-button.active {
        color: var(--navy-900);
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(225, 235, 248, 0.96));
        box-shadow: inset 0 0 0 1px var(--line-strong);
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
        border-radius: 10px;
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

      .partner-console {
        flex: 1 1 100%;
      }

      .partner-topline {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(240px, 0.9fr);
        gap: 12px;
      }

      .partner-summary-card {
        min-height: 100%;
      }

      .partner-mini-metrics {
        display: grid;
        gap: 12px;
      }

      .partner-status-cluster {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 6px;
      }

      .command-bar-frame {
        border: 1px solid rgba(17, 36, 62, 0.12);
        border-radius: 10px;
        background: rgba(236, 244, 252, 0.96);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
        overflow: hidden;
      }

      .quick-prompt-row {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .quick-prompt {
        border: 1px solid rgba(17, 36, 62, 0.12);
        border-radius: 8px;
        min-height: 38px;
        padding: 0 14px;
        background: rgba(36, 76, 123, 0.38);
        color: #e7f1ff;
        cursor: pointer;
        font-weight: 700;
        font-size: 0.88rem;
      }

      .partner-transcript {
        display: grid;
        gap: 12px;
        max-height: 560px;
        min-height: 420px;
        padding-right: 4px;
        overflow: auto;
      }

      .partner-bubble {
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid rgba(126, 173, 219, 0.16);
        background: rgba(15, 27, 44, 0.84);
      }

      .partner-bubble.user {
        background: rgba(30, 54, 82, 0.88);
      }

      .partner-bubble.assistant {
        background: rgba(14, 40, 70, 0.88);
      }

      .partner-bubble.system {
        background: rgba(26, 46, 73, 0.88);
      }

      .partner-bubble-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }

      .partner-bubble-label {
        color: rgba(194, 222, 255, 0.88);
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .partner-bubble-time {
        color: rgba(194, 212, 237, 0.56);
        font-size: 0.76rem;
      }

      .partner-bubble-body {
        margin: 0;
        color: #ecf4ff;
        line-height: 1.6;
        white-space: pre-wrap;
      }

      .partner-composer {
        display: grid;
        gap: 10px;
      }

      .composer-label {
        font-weight: 700;
      }

      .partner-composer textarea {
        width: 100%;
        border: 0;
        padding: 14px 16px;
        font: inherit;
        color: var(--text);
        background: transparent;
        resize: vertical;
      }

      .partner-composer textarea:focus {
        outline: none;
      }

      .command-bar-help {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        border-top: 1px solid rgba(17, 36, 62, 0.08);
        padding: 10px 16px 12px;
        color: var(--muted);
        font-size: 0.85rem;
      }

      .keyboard-hint {
        display: inline-flex;
        align-items: center;
        min-height: 28px;
        padding: 0 10px;
        border-radius: 8px;
        background: rgba(17, 36, 62, 0.08);
        color: var(--navy-800);
        font-weight: 700;
      }

      .message-preview {
        padding: 10px 12px;
        border-radius: 8px;
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
        border-radius: 8px;
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

      .compact-thread-card,
      .attention-card,
      .workspace-card {
        padding: 14px 16px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: rgba(247, 250, 255, 0.92);
      }

      .compact-thread-card strong,
      .attention-card strong,
      .workspace-card strong {
        display: block;
      }

      .compact-thread-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 8px;
      }

      .compact-thread-preview,
      .attention-copy,
      .workspace-copy {
        margin: 8px 0 0;
        color: var(--muted);
        line-height: 1.55;
        font-size: 0.9rem;
      }

      .workspace-card code {
        display: block;
        margin-top: 10px;
      }

      .emphasis-card {
        background: linear-gradient(145deg, rgba(17, 36, 62, 0.08), rgba(15, 118, 110, 0.08));
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
        border-radius: 8px;
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
        .studio-topbar,
        .studio-workspace,
        .studio-console-shell,
        .studio-grid-two,
        .studio-stats-grid {
          grid-template-columns: 1fr;
        }

        .studio-rail,
        .studio-sidebar,
        .studio-main,
        .studio-inspector {
          min-height: auto;
        }

        .studio-top-status {
          justify-content: flex-start;
        }

        .hero {
          grid-template-columns: 1fr;
        }

        h1 {
          max-width: none;
        }

        .app-header,
        .command-ribbon,
        .workbench-grid,
        .partner-topline,
        .workbench-stat-grid {
          grid-template-columns: 1fr;
        }

        .app-header-actions {
          justify-content: flex-start;
        }

        .ribbon-card-wide {
          grid-column: span 1;
        }
      }

      @media (max-width: 640px) {
        .shell {
          padding: 18px 12px 36px;
        }

        .studio-topbar {
          grid-template-columns: 1fr;
        }

        .hero,
        .section {
          padding: 18px;
        }

        .code-line,
        .token-row,
        .section-head,
        .status-line,
        .inline-qr-card,
        .command-bar-help {
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
      const studioRailButtons = Array.from(document.querySelectorAll(".studio-rail-button"));
      const storageKey = "freedom-desktop-tab";
      const showToast = (message) => {
        if (!toast) return;
        toast.textContent = message;
        toast.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("visible"), 1800);
      };
      const escapeHtml = (value) =>
        String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
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
        syncStudioRail();
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
          const studioTarget = link.getAttribute("data-studio-open");
          if (studioTarget) {
            activateStudioTab(studioTarget);
          }
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
      const studioTabs = Array.from(document.querySelectorAll("[data-studio-tab-target]"));
      const studioPanels = Array.from(document.querySelectorAll("[data-studio-panel]"));
      const syncStudioRail = () => {
        const activeTopTab = tabs.find((button) => button.classList.contains("active"))?.getAttribute("data-tab-target");
        const activeStudioTab = studioTabs.find((button) => button.classList.contains("active"))?.getAttribute("data-studio-tab-target");
        studioRailButtons.forEach((button) => {
          const topTarget = button.getAttribute("data-tab-open");
          const studioTarget = button.getAttribute("data-studio-open");
          const active =
            topTarget === activeTopTab &&
            (!studioTarget || studioTarget === activeStudioTab || activeTopTab !== "operator");
          button.classList.toggle("active", Boolean(active));
        });
      };
      const activateStudioTab = (tabId) => {
        const targetId = studioTabs.some((button) => button.getAttribute("data-studio-tab-target") === tabId)
          ? tabId
          : studioTabs[0]?.getAttribute("data-studio-tab-target");
        if (!targetId) return;
        studioTabs.forEach((button) => {
          const active = button.getAttribute("data-studio-tab-target") === targetId;
          button.classList.toggle("active", active);
        });
        studioPanels.forEach((panel) => {
          const active = panel.getAttribute("data-studio-panel") === targetId;
          panel.classList.toggle("active", active);
          panel.toggleAttribute("hidden", !active);
        });
        syncStudioRail();
      };
      studioTabs.forEach((button) => {
        button.addEventListener("click", () => activateStudioTab(button.getAttribute("data-studio-tab-target")));
      });
      studioRailButtons.forEach((button) => {
        button.addEventListener("click", () => {
          const studioTarget = button.getAttribute("data-studio-open");
          if (studioTarget) {
            activateStudioTab(studioTarget);
          } else {
            syncStudioRail();
          }
        });
      });
      activateStudioTab("desk");
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

      const desktopConsole = document.querySelector("[data-desktop-console]");
      if (desktopConsole) {
        const stateUrl = desktopConsole.getAttribute("data-state-url");
        const sessionUrl = desktopConsole.getAttribute("data-session-url");
        const sessionBase = desktopConsole.getAttribute("data-session-base");
        const sessionTitle = document.getElementById("partner-session-title");
        const sessionMeta = document.getElementById("partner-session-meta");
        const sessionStatusPill = document.getElementById("partner-status-pill");
        const sessionLastActivity = document.getElementById("partner-last-activity");
        const sessionMessageCount = document.getElementById("partner-message-count");
        const sessionFocusSummary = document.getElementById("partner-focus-summary");
        const messageList = document.getElementById("partner-messages");
        const composer = document.getElementById("partner-composer");
        const input = document.getElementById("partner-input");
        const sendButton = document.getElementById("partner-send");
        const stopButton = document.getElementById("partner-stop");
        const promptButtons = Array.from(document.querySelectorAll("[data-partner-prompt]"));
        let currentSessionId = null;
        let currentSessionStatus = "idle";
        let refreshTimer;
        let requestActive = false;

        const readErrorMessage = async (response) => {
          try {
            const payload = await response.json();
            return payload?.error || "Freedom could not complete that request.";
          } catch {
            return "Freedom could not complete that request.";
          }
        };

        const humanizeSessionStatus = (value) =>
          ({
            idle: "Ready for the next move",
            queued: "Queued for execution",
            running: "Working now",
            stopping: "Stopping the run",
            error: "Needs attention"
          })[value] || "Ready";

        const formatMessageTime = (iso) => {
          if (!iso) return "";
          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) return "";
          return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        };

        const relativeTime = (iso) => {
          if (!iso) return "Just now";
          const date = new Date(iso);
          if (Number.isNaN(date.getTime())) return "Just now";
          const deltaSeconds = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
          if (deltaSeconds < 60) return deltaSeconds + "s ago";
          const deltaMinutes = Math.round(deltaSeconds / 60);
          if (deltaMinutes < 60) return deltaMinutes + "m ago";
          const deltaHours = Math.round(deltaMinutes / 60);
          if (deltaHours < 24) return deltaHours + "h ago";
          const deltaDays = Math.round(deltaHours / 24);
          return deltaDays + "d ago";
        };

        const pillClassForStatus = (status) =>
          ({
            running: "pill-teal",
            queued: "pill-orange",
            stopping: "pill-orange",
            error: "pill-orange",
            idle: "pill-navy"
          })[status] || "pill-navy";

        const updateComposerState = () => {
          const hasSession = Boolean(currentSessionId);
          const busy = ["queued", "running", "stopping"].includes(currentSessionStatus);
          if (sendButton) {
            sendButton.disabled = !input || !input.value.trim() || busy;
          }
          if (stopButton) {
            stopButton.disabled = !hasSession || !busy;
          }
          if (input) {
            input.placeholder = busy
              ? "Freedom is working on the current turn."
              : "Ask for priorities, a plan, a draft, a hard call, or the next concrete move.";
          }
        };

        const renderMessages = (messages) => {
          if (!messageList) return;
          if (!messages?.length) {
            messageList.innerHTML = '<div class="empty-state">The partner desk is ready. Ask Freedom to brief you, challenge a plan, or drive the next move.</div>';
            return;
          }
          messageList.innerHTML = messages
            .map((message) => {
              const roleLabel =
                message.role === "assistant" ? "Freedom" : message.role === "user" ? "You" : "System";
              const errorMarkup = message.errorMessage
                ? '<div class="error-note">' + escapeHtml(message.errorMessage) + "</div>"
                : "";
              return (
                '<div class="partner-bubble ' +
                escapeHtml(message.role) +
                '">' +
                '<div class="partner-bubble-header">' +
                '<span class="partner-bubble-label">' +
                escapeHtml(roleLabel) +
                "</span>" +
                '<span class="partner-bubble-time">' +
                escapeHtml(formatMessageTime(message.updatedAt || message.createdAt)) +
                "</span>" +
                "</div>" +
                '<p class="partner-bubble-body">' +
                escapeHtml(message.content || "") +
                "</p>" +
                errorMarkup +
                "</div>"
              );
            })
            .join("");
          messageList.scrollTop = messageList.scrollHeight;
        };

        const renderState = (payload) => {
          const session = payload?.desktopSession || null;
          const messages = payload?.desktopMessages || [];
          const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
          const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");
          currentSessionId = session?.id || null;
          currentSessionStatus = session?.status || "idle";
          if (sessionTitle) {
            sessionTitle.textContent = session?.title || ${JSON.stringify(FREEDOM_PRIMARY_SESSION_TITLE)};
          }
          if (sessionMeta) {
            sessionMeta.textContent = session
              ? humanizeSessionStatus(session.status) + " • " + session.rootPath
              : "Open the partner desk on this desktop to start a working session with Freedom.";
          }
          if (sessionStatusPill) {
            sessionStatusPill.textContent = session ? humanizeSessionStatus(session.status) : "Preparing";
            sessionStatusPill.className = "pill " + pillClassForStatus(session?.status || "idle");
          }
          if (sessionLastActivity) {
            sessionLastActivity.textContent = session?.updatedAt ? "Updated " + relativeTime(session.updatedAt) : "Opening the local partner desk.";
          }
          if (sessionMessageCount) {
            sessionMessageCount.textContent = String(messages.length);
          }
          if (sessionFocusSummary) {
            const focusText =
              latestAssistantMessage?.content?.trim() ||
              latestUserMessage?.content?.trim() ||
              "Waiting for the first move";
            sessionFocusSummary.textContent = focusText.length > 42 ? focusText.slice(0, 41).trimEnd() + "…" : focusText;
          }
          renderMessages(messages);
          updateComposerState();
        };

        const ensureSession = async () => {
          if (!sessionUrl) {
            throw new Error("Partner desk is not configured.");
          }
          const response = await fetch(sessionUrl, { method: "POST" });
          if (!response.ok) {
            throw new Error(await readErrorMessage(response));
          }
          return response.json();
        };

        const refreshState = async (createIfMissing = false) => {
          if (!stateUrl || requestActive) return;
          requestActive = true;
          try {
            let response = await fetch(stateUrl, { headers: { accept: "application/json" } });
            if (!response.ok) {
              throw new Error(await readErrorMessage(response));
            }
            let payload = await response.json();
            if (createIfMissing && !payload?.desktopSession) {
              await ensureSession();
              response = await fetch(stateUrl, { headers: { accept: "application/json" } });
              if (!response.ok) {
                throw new Error(await readErrorMessage(response));
              }
              payload = await response.json();
            }
            renderState(payload);
          } catch (error) {
            const message = error instanceof Error ? error.message : "Freedom needs attention on this desktop.";
            if (sessionMeta) {
              sessionMeta.textContent = message;
            }
            if (messageList) {
              messageList.innerHTML = '<div class="empty-state">' + escapeHtml(message) + "</div>";
            }
          } finally {
            requestActive = false;
          }
        };

        composer?.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!input || !sessionBase) return;
          const text = input.value.trim();
          if (!text) return;
          try {
            if (!currentSessionId) {
              const session = await ensureSession();
              currentSessionId = session.id;
            }
            const response = await fetch(sessionBase + "/" + encodeURIComponent(currentSessionId) + "/messages", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json"
              },
              body: JSON.stringify({
                text,
                inputMode: "text",
                responseStyle: "executive"
              })
            });
            if (!response.ok) {
              throw new Error(await readErrorMessage(response));
            }
            input.value = "";
            updateComposerState();
            showToast("Sent to Freedom");
            await refreshState();
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Send failed");
          }
        });

        stopButton?.addEventListener("click", async () => {
          if (!currentSessionId || !sessionBase) return;
          try {
            const response = await fetch(sessionBase + "/" + encodeURIComponent(currentSessionId) + "/stop", {
              method: "POST",
              headers: { accept: "application/json" }
            });
            if (!response.ok) {
              throw new Error(await readErrorMessage(response));
            }
            showToast("Stop requested");
            await refreshState();
          } catch (error) {
            showToast(error instanceof Error ? error.message : "Stop failed");
          }
        });

        input?.addEventListener("input", () => updateComposerState());
        window.addEventListener("keydown", (event) => {
          if (!input) return;
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            input.focus();
          }
        });
        promptButtons.forEach((button) => {
          button.addEventListener("click", () => {
            if (!input) return;
            input.value = button.getAttribute("data-partner-prompt") || "";
            input.focus();
            updateComposerState();
          });
        });

        void refreshState(true);
        refreshTimer = setInterval(() => {
          void refreshState(false);
        }, 4000);
        window.addEventListener("beforeunload", () => clearInterval(refreshTimer));
      }
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

function renderAccordionPanel(label: string, title: string, body: string): string {
  return `
    <article class="panel section">
      <div class="section-head">
        <div>
          <span class="label">${escapeHtml(label)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </div>
      <div class="stack gap-md">
        ${body}
      </div>
    </article>
  `;
}

function renderWorkbenchSignalCard(title: string, value: string, detail: string): string {
  return `
    <div class="status-card">
      <strong>${escapeHtml(title)}</strong>
      <div class="compact-thread-meta">
        <span class="pill pill-navy">${escapeHtml(value)}</span>
      </div>
      <p>${escapeHtml(detail)}</p>
    </div>
  `;
}

function renderWorkbenchSessionCard(activity: RecentSessionActivity): string {
  const preview =
    activity.latestAssistantMessage?.content?.trim() ||
    activity.latestUserMessage?.content?.trim() ||
    activity.session.lastPreview ||
    "No recent transcript yet.";
  return `
    <div class="compact-thread-card">
      <strong>${escapeHtml(activity.session.title)}</strong>
      <div class="compact-thread-meta">
        <span class="micro">${escapeHtml(activity.session.rootPath)}</span>
        <span class="pill ${sessionPillClass(activity.session.status)}">${escapeHtml(humanizeSessionStatus(activity.session.status))}</span>
      </div>
      <p class="compact-thread-preview">${escapeHtml(truncatePreview(preview, 120))}</p>
      <span class="micro">Updated ${escapeHtml(timeAgo(activity.lastMessageAt ?? activity.session.updatedAt))}</span>
    </div>
  `;
}

function renderAttentionEventCard(event: DesktopOverviewResponse["overview"]["auditEvents"][number]): string {
  return `
    <div class="attention-card">
      <strong>${escapeHtml(event.type.replace(/_/g, " "))}</strong>
      <p class="attention-copy">${escapeHtml(event.detail ?? "No extra detail recorded.")}</p>
      <span class="micro">${escapeHtml(timeAgo(event.createdAt))}</span>
    </div>
  `;
}

function renderWorkspaceContextCard(root: string): string {
  return `
    <div class="workspace-card">
      <strong>Approved root</strong>
      <p class="workspace-copy">Freedom can plan and execute against this workspace from desktop and companion surfaces.</p>
      <code>${escapeHtml(root)}</code>
    </div>
  `;
}

function renderSessionCard(activity: RecentSessionActivity): string {
  const { session, latestUserMessage, latestAssistantMessage, lastMessageAt } = activity;
  const assistantPreview = session.lastError
    ? `Latest run stopped with an error: ${session.lastError}`
      : latestAssistantMessage?.content?.trim()
      ? latestAssistantMessage.content
      : session.status === "running" || session.status === "queued"
        ? `${FREEDOM_PRODUCT_NAME} is working on the latest turn.`
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
        ${renderMessagePreview(`${FREEDOM_PRODUCT_NAME} replied`, assistantPreview, "No assistant reply has landed yet.", "assistant")}
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

  return resolveLocalBaseUrl(req);
}

function resolveLocalBaseUrl(req: IncomingMessage): string {
  const hostHeader = req.headers.host ?? "127.0.0.1:43111";
  return `http://${stripTrailingSlash(hostHeader)}`;
}

function isLoopbackRequest(req: IncomingMessage): boolean {
  const remoteAddress = req.socket.remoteAddress ?? "";
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
}

function humanizeAuth(value: string): string {
  if (value === "logged_in") {
    return "Freedom ready";
  }
  if (value === "error") {
    return "Freedom needs attention";
  }
  return "Freedom login required";
}

function humanizeAvailability(value: string): string {
  switch (value) {
    case "codex_unavailable":
      return "Freedom unavailable";
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
