import { app, BrowserWindow, Menu, Tray, Notification, clipboard, nativeImage, shell } from "electron";
import type { Event as ElectronEvent, HandlerDetails, MenuItemConstructorOptions } from "electron";
import type { DesktopOverviewResponse } from "@adam-connect/shared";
import { renderLoadingHtml } from "./loadingHtml.js";
import { DesktopShellSupervisor } from "./supervisor.js";

const dashboardFallbackUrl = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 43111}/`;
const supervisor = new DesktopShellSupervisor();

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let tray: InstanceType<typeof Tray> | null = null;
let latestOverview: DesktopOverviewResponse | null = null;
let isQuitting = false;
let lostConnectionAttempts = 0;
let lastPairingCode: string | null = null;

app.disableHardwareAcceleration();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setName("Freedom Desktop");

  app.on("second-instance", () => {
    void revealOperatorConsole({ focus: true, forceDashboard: true });
  });

  app.whenReady().then(async () => {
    createWindow();
    createTray();
    attachSupervisorEvents();
    await boot();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
        void boot();
      }
    });
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("will-quit", (event: ElectronEvent) => {
    event.preventDefault();
    void supervisor.stop().then(() => {
      app.exit(0);
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#fdf8ef",
    title: "Freedom Desktop",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setVisibleOnAllWorkspaces(false);

  mainWindow.on("ready-to-show", () => {
    if (!mainWindow?.isVisible()) {
      mainWindow?.show();
    }
  });

  mainWindow.on("close", (event: ElectronEvent) => {
    if (!isQuitting) {
      isQuitting = true;
      void supervisor.stop().finally(() => {
        mainWindow?.destroy();
        app.quit();
      });
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (shouldOpenExternally(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.webContents.setZoomFactor(0.92);

  loadInterstitial("Launching Freedom", "Preparing the native desktop shell and local services.");
}

function createTray(): void {
  tray = new Tray(createAppIcon());
  tray.setToolTip("Freedom Desktop");
  tray.on("click", () => {
    void revealOperatorConsole({ focus: true, forceDashboard: false });
  });
  updateApplicationMenu();
}

function attachSupervisorEvents(): void {
  supervisor.on("status", (status) => {
    if (status.state !== "ready") {
      const detail = status.detail ? `\n${sanitizeShellDetail(status.detail)}` : "";
      loadInterstitial(status.message, "Keeping the native Freedom console and runtime bridge healthy.", detail.trim());
    }
    const tooltip = `${status.message}${status.detail ? ` • ${status.detail}` : ""}`;
    tray?.setToolTip(tooltip);
  });

  supervisor.on("overview", (overview) => {
    latestOverview = overview;
    lostConnectionAttempts = 0;
    const pairingCode = overview.overview.hostStatus?.host.pairingCode ?? null;
    if (pairingCode && lastPairingCode && pairingCode !== lastPairingCode) {
      notify("Pairing code updated", `New pairing code: ${pairingCode}`);
    }
    lastPairingCode = pairingCode;
    updateApplicationMenu();
    updateWindowTitle();
  });
}

async function boot(): Promise<void> {
  try {
    const overview = await supervisor.start();
    latestOverview = overview;
    lastPairingCode = overview.overview.hostStatus?.host.pairingCode ?? null;
    await loadDashboard(overview.dashboardUrl);
    updateApplicationMenu();
    updateWindowTitle();
    startHealthLoop();
  } catch (error) {
    const message = sanitizeShellDetail(error instanceof Error ? error.message : "Unknown startup failure");
    loadInterstitial("Freedom needs attention", "The native shell could not finish starting.", message);
    notify("Freedom failed to start", message);
  }
}

let healthLoopStarted = false;
let restartFailures = 0;
function startHealthLoop(): void {
  if (healthLoopStarted) {
    return;
  }
  healthLoopStarted = true;

  setInterval(() => {
    void (async () => {
      const overview = await supervisor.refreshOverview();
      if (overview) {
        latestOverview = overview;
        updateApplicationMenu();
        updateWindowTitle();
        return;
      }

      lostConnectionAttempts += 1;
      if (lostConnectionAttempts < 2) {
        return;
      }
      if (restartFailures >= 3) {
        return;
      }

      loadInterstitial(
        "Reconnecting Freedom",
        "The shell lost contact with the local services, so it is trying a safe restart.",
        dashboardFallbackUrl
      );

      try {
        const restarted = await supervisor.restart();
        latestOverview = restarted;
        lastPairingCode = restarted.overview.hostStatus?.host.pairingCode ?? null;
        await loadDashboard(restarted.dashboardUrl);
        lostConnectionAttempts = 0;
        restartFailures = 0;
        updateApplicationMenu();
        updateWindowTitle();
      } catch (error) {
        restartFailures += 1;
        const message = sanitizeShellDetail(error instanceof Error ? error.message : "Restart failed");
        loadInterstitial(
          "Freedom needs attention",
          restartFailures >= 3
            ? "Automatic restart paused after repeated failures. Use the menu to restart when you are ready."
            : "The shell could not restart cleanly yet. It will keep trying while the app remains open.",
          message
        );
        notify("Freedom restart failed", message);
      }
    })();
  }, 5000);
}

async function loadDashboard(url: string): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  try {
    await mainWindow.loadURL(url);
  } catch (error) {
    if (isNavigationAbort(error)) {
      return;
    }
    throw error;
  }
}

function loadInterstitial(title: string, message: string, detail?: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  const html = renderLoadingHtml(title, message, detail);
  const dataUrl = `data:text/html;charset=utf-8;base64,${Buffer.from(html, "utf8").toString("base64")}`;
  void mainWindow.loadURL(dataUrl).catch(() => undefined);
}

function updateWindowTitle(): void {
  if (!mainWindow) {
    return;
  }
  const pairingCode = latestOverview?.overview.hostStatus?.host.pairingCode;
  const suffix = pairingCode ? ` • ${pairingCode}` : "";
  mainWindow.setTitle(`Freedom Desktop${suffix}`);
}

async function revealOperatorConsole(options?: { focus?: boolean; forceDashboard?: boolean }): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    await boot();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  if (options?.focus) {
    mainWindow.focus();
  }

  if (latestOverview) {
    if (options?.forceDashboard !== false && !isShowingDashboard(latestOverview.dashboardUrl)) {
      await loadDashboard(latestOverview.dashboardUrl);
    }
    return;
  }

  await boot();
}

function updateApplicationMenu(): void {
  const pairingCode = latestOverview?.overview.hostStatus?.host.pairingCode ?? "Unavailable";
  const mobileUrl = latestOverview?.overview.hostStatus?.tailscale.suggestedUrl ?? latestOverview?.publicBaseUrl ?? dashboardFallbackUrl;
  const installUrl = latestOverview?.installUrl ?? `${dashboardFallbackUrl}install`;
  const dashboardUrl = latestOverview?.dashboardUrl ?? dashboardFallbackUrl;

  const template = [
    {
      label: "Freedom",
      submenu: [
        {
          label: "Show Freedom Console",
          click: async () => {
            await revealOperatorConsole({ focus: true, forceDashboard: true });
          }
        },
        {
          label: "Open Install & Recovery Page",
          click: () => {
            void shell.openExternal(installUrl);
          }
        },
        {
          label: "Copy Pairing Code",
          click: () => {
            clipboard.writeText(pairingCode);
            notify("Copied pairing code", pairingCode);
          }
        },
        {
          label: "Copy Mobile URL",
          click: () => {
            clipboard.writeText(mobileUrl);
            notify("Copied mobile URL", mobileUrl);
          }
        },
        {
          label: "Restart Services",
          click: async () => {
            loadInterstitial("Restarting Freedom", "Refreshing the native shell and local services.");
            const overview = await supervisor.restart();
            latestOverview = overview;
            await loadDashboard(overview.dashboardUrl);
            updateApplicationMenu();
            updateWindowTitle();
          }
        },
        {
          type: "separator"
        },
        {
          label: "Quit",
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    }
  ] as MenuItemConstructorOptions[];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  tray?.setContextMenu(menu);
  tray?.setToolTip(`Freedom Console • Pairing ${pairingCode}`);
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({ title, body }).show();
}

function shouldOpenExternally(url: string): boolean {
  try {
    const target = new URL(url);
    return target.pathname === "/install" || target.pathname === "/install/qr.svg" || target.pathname.startsWith("/downloads/");
  } catch {
    return false;
  }
}

function isShowingDashboard(url: string): boolean {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  const currentUrl = mainWindow.webContents.getURL();
  if (!currentUrl) {
    return false;
  }
  return stripUrlForComparison(currentUrl) === stripUrlForComparison(url);
}

function isNavigationAbort(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("ERR_ABORTED") || error.message.includes("Object has been destroyed");
}

function stripUrlForComparison(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function sanitizeShellDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (compact.includes("loading 'data:text/html")) {
    return "The shell swapped between startup views before one screen finished loading. Try opening Freedom again.";
  }
  if (compact.includes("Object has been destroyed")) {
    return "The previous Freedom window closed during startup. Open the launcher again to reconnect.";
  }
  return compact;
}

function createAppIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#11243e" />
          <stop offset="100%" stop-color="#1b365d" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="64" fill="#fdf8ef" />
      <rect x="26" y="26" width="204" height="204" rx="52" fill="url(#g)" />
      <path d="M85 210 119 84h18l34 126h-29l-5-24h-19l-5 24H85zm39-50h9l-4-22c-1-7-2-13-3-19-1 6-2 12-3 19l-4 22zm-10 1h28v18h-28z" fill="#fdf8ef"/>
      <circle cx="186" cy="79" r="18" fill="#d96b1c"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}
