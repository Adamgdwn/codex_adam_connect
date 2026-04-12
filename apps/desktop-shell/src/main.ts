import * as electron from "electron/main";
import * as electronCommon from "electron/common";
import type { Event as ElectronEvent, HandlerDetails, MenuItemConstructorOptions } from "electron";
import type { DesktopOverviewResponse } from "@adam-connect/shared";
import { renderLoadingHtml } from "./loadingHtml.js";
import { DesktopShellSupervisor } from "./supervisor.js";

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification
} = electron;

const { clipboard, nativeImage, shell } = electronCommon;

const dashboardFallbackUrl = `http://127.0.0.1:${process.env.GATEWAY_PORT ?? 43111}/`;
const supervisor = new DesktopShellSupervisor();

let mainWindow: InstanceType<typeof BrowserWindow> | null = null;
let tray: InstanceType<typeof Tray> | null = null;
let latestOverview: DesktopOverviewResponse | null = null;
let isQuitting = false;
let lostConnectionAttempts = 0;
let lastPairingCode: string | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.setName("Adam Connect Desktop");

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  }
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
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  // Stay resident in the tray unless the user explicitly quits.
});

app.on("will-quit", (event: ElectronEvent) => {
  event.preventDefault();
  void supervisor.stop().then(() => {
    app.exit(0);
  });
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#fdf8ef",
    title: "Adam Connect Desktop",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event: ElectronEvent) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  loadInterstitial("Launching Adam Connect", "Preparing the native desktop shell and local services.");
}

function createTray(): void {
  tray = new Tray(createAppIcon());
  tray.setToolTip("Adam Connect Desktop");
  tray.on("click", () => {
    if (!mainWindow) {
      createWindow();
      void boot();
      return;
    }
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
  updateApplicationMenu();
}

function attachSupervisorEvents(): void {
  supervisor.on("status", (status) => {
    const detail = status.detail ? `\n${status.detail}` : "";
    loadInterstitial(status.message, "Keeping the desktop dashboard and local Codex bridge healthy.", detail.trim());
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
    const message = error instanceof Error ? error.message : "Unknown startup failure";
    loadInterstitial("Adam Connect needs attention", "The native shell could not finish starting.", message);
    notify("Adam Connect failed to start", message);
  }
}

let healthLoopStarted = false;
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

      loadInterstitial(
        "Reconnecting Adam Connect",
        "The shell lost contact with the local services, so it is trying a safe restart.",
        dashboardFallbackUrl
      );

      try {
        const restarted = await supervisor.restart();
        latestOverview = restarted;
        lastPairingCode = restarted.overview.hostStatus?.host.pairingCode ?? null;
        await loadDashboard(restarted.dashboardUrl);
        lostConnectionAttempts = 0;
        updateApplicationMenu();
        updateWindowTitle();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Restart failed";
        notify("Adam Connect restart failed", message);
      }
    })();
  }, 5000);
}

async function loadDashboard(url: string): Promise<void> {
  if (!mainWindow) {
    return;
  }
  await mainWindow.loadURL(url);
}

function loadInterstitial(title: string, message: string, detail?: string): void {
  if (!mainWindow) {
    return;
  }
  const html = renderLoadingHtml(title, message, detail);
  void mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function updateWindowTitle(): void {
  if (!mainWindow) {
    return;
  }
  const pairingCode = latestOverview?.overview.hostStatus?.host.pairingCode;
  const suffix = pairingCode ? ` • ${pairingCode}` : "";
  mainWindow.setTitle(`Adam Connect Desktop${suffix}`);
}

function updateApplicationMenu(): void {
  const pairingCode = latestOverview?.overview.hostStatus?.host.pairingCode ?? "Unavailable";
  const mobileUrl = latestOverview?.overview.hostStatus?.tailscale.suggestedUrl ?? latestOverview?.publicBaseUrl ?? dashboardFallbackUrl;
  const installUrl = latestOverview?.installUrl ?? `${dashboardFallbackUrl}install`;
  const dashboardUrl = latestOverview?.dashboardUrl ?? dashboardFallbackUrl;

  const template = [
    {
      label: "Adam Connect",
      submenu: [
        {
          label: "Show Dashboard",
          click: async () => {
            if (!mainWindow) {
              createWindow();
            }
            mainWindow?.show();
            await loadDashboard(dashboardUrl);
          }
        },
        {
          label: "Open Install Page In Browser",
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
            loadInterstitial("Restarting Adam Connect", "Refreshing the native shell and local services.");
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
  tray?.setToolTip(`Adam Connect • Pairing ${pairingCode}`);
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) {
    return;
  }
  new Notification({ title, body }).show();
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
      <path d="M77 84h64c29 0 48 18 48 44 0 18-9 31-24 38l31 44h-39l-24-35h-20v35H77V84zm36 31v31h24c10 0 16-6 16-15 0-10-6-16-16-16h-24z" fill="#fdf8ef"/>
      <circle cx="186" cy="79" r="18" fill="#d96b1c"/>
    </svg>
  `;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}
