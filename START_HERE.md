# START HERE

This repo now targets one primary path: pair a phone to this computer and chat with the local Codex CLI by text or voice-transcribed text.

For a user-facing walkthrough with a flow diagram, see [docs/manual.md](/home/adamgoodwin/code/agents/codex_adam_connect/docs/manual.md).
For the current checkpoint handoff, see [docs/STATUS.md](/home/adamgoodwin/code/agents/codex_adam_connect/docs/STATUS.md).

## Status Right Now

### What Just Completed

- the browser dashboard at `http://127.0.0.1:43111/` is now the supported desktop GUI
- `npm run launch` starts the gateway plus desktop host and opens that GUI automatically
- the dashboard includes pairing, Tailscale guidance, recent sessions, recent devices, QR onboarding, and Android APK download support
- a Linux desktop launcher installer is available via `npm run app:desktop:install-launcher`

### What Is Next

- run another real-phone acceptance pass through the dashboard-based install and chat flow
- decide whether the new Electron shell scaffold should be promoted to a supported path or stay internal until runtime issues are resolved
- validate iOS and release packaging after the desktop dashboard flow is fully locked down

## 1) Prerequisites

- Node.js 22.11+
- npm 11+
- the `codex` CLI installed on this computer
- a working local Codex login on this computer
- Tailscale or another private network path from your phone to this machine
- Android Studio or Xcode for the React Native client

Check Codex auth:

```bash
codex login status
```

If needed:

```bash
codex login --device-auth
```

## 2) Install

```bash
cp .env.example .env
npm install
```

Fill `.env`:

- `DESKTOP_APPROVED_ROOTS`
- optional: `GATEWAY_HOST`
- optional: `GATEWAY_ANDROID_APK_PATH`
- optional: `DESKTOP_GATEWAY_URL`
- optional: `CODEX_APP_SERVER_URL`

## 3) Validate The Repo

```bash
bash scripts/governance-preflight.sh
npm run typecheck
npm run build
npm run lint
npm test
```

## 4) Launch The Desktop App

```bash
npm run launch
```

The launcher:

- starts the gateway and desktop host together
- fills in a sane default approved root if you have not configured one yet
- opens the desktop dashboard in your browser automatically

The desktop host still prints:

- gateway URL
- host ID
- pairing code
- Codex auth state
- suggested Tailscale mobile URL

If you prefer the lower-level terminal-only path, you can still run:

```bash
npm run dev:desktop-stack
```

If you want Adam Connect to appear in the Linux app menu, also run:

```bash
npm run app:desktop:install-launcher
```

The desktop dashboard at `http://127.0.0.1:43111/` now shows:

- the live pairing code
- host and Tailscale health
- recent chats and paired devices
- a QR code for the phone install/onboarding page
- an Android APK download button if `GATEWAY_ANDROID_APK_PATH` points to a built package

## 5) Start The Mobile App

Terminal 2:

```bash
npm run dev:mobile
```

Terminal 3:

```bash
cd apps/mobile
npm run android
```

If you want a transferable Android APK from this desktop, you still need a local Android build toolchain:

- Java 17+
- Android SDK / platform tools
- a successful Gradle build under `apps/mobile/android`

## 6) Pair And Chat

1. enter the desktop URL reachable from your phone
2. enter the pairing code shown by the desktop host
3. create a chat session from one of the approved roots
4. send a text message or use push-to-talk
5. watch the assistant response stream into the chat
6. stop the run from the phone if needed

## 7) Smoke Test

After `npm run build`, run:

```bash
npm run smoke
```

The smoke test:

- starts the gateway and desktop host
- pairs a synthetic mobile device
- creates a chat session
- sends a message to Codex
- waits for the assistant reply

`npm run smoke` requires the local Codex CLI to already be logged in.
