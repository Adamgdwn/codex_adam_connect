# Adam Connect

Adam Connect turns a paired phone into a remote chat surface for the local Codex CLI running on this computer.

## Status Snapshot

See [docs/STATUS.md](/home/adamgoodwin/code/agents/codex_adam_connect/docs/STATUS.md) for the current checkpoint handoff.

### Completed

- paired phone chat flow is live through the gateway and desktop Codex bridge
- the browser-based desktop dashboard is the current supported GUI
- the dashboard now shows pairing code, Tailscale status, recent sessions, recent devices, QR onboarding, and Android APK download links
- `npm run launch` starts the local services and opens the dashboard automatically
- `npm run app:desktop:install-launcher` installs a Linux desktop-menu launcher that points at the supported browser dashboard flow
- the phone keeps a default `Operator` chat path for quick remote turns
- pairing codes stay stable across normal desktop restarts, and stale phone tokens can enter a repair flow instead of a full cold start

### Next

- validate the operator loop on a real phone end to end again after this checkpoint
- keep improving voice send/reply behavior, readable chat output, and shared phone/desktop recovery messaging
- either finish promoting the Electron desktop-shell scaffold into a supported launch path or remove it if the browser-first experience stays better
- validate iOS packaging and real-device behavior
- harden packaging, release, and smoke coverage around the desktop surface

## What It Does

- `apps/gateway`: local network API plus realtime websocket fan-out
- `apps/desktop-extension`: desktop host runtime that supervises local Codex app-server
- `apps/mobile`: React Native companion for pairing, chat sessions, text, and push-to-talk voice input

## Core Flow

1. the desktop host starts and registers itself with the gateway
2. the desktop host generates a pairing code
3. the phone pairs with that code and receives a long-lived device token
4. the phone repairs or reconnects using that saved URL plus token when possible
5. the phone uses a default `Operator` chat or creates named chats scoped to approved desktop roots
5. the phone sends text or voice-transcribed text
6. the desktop host relays that turn to the local Codex app-server
7. the gateway streams host status, session updates, and assistant message deltas back to the phone

## Auth Model

- the phone does not store an OpenAI API key
- the desktop host depends on the local Codex CLI login state
- if Codex is logged out, the host reports that clearly and the recovery path is `codex login --device-auth`

## Run It

- copy `.env.example` to `.env`
- set `DESKTOP_APPROVED_ROOTS` to one or more absolute roots
- optionally set `MOBILE_DEFAULT_BASE_URL` to prefill the desktop URL in local mobile builds
- launch the desktop app with `npm run launch`
- the launcher opens `http://127.0.0.1:43111/` automatically as the desktop dashboard
- optional on Linux: install a menu launcher with `npm run app:desktop:install-launcher`
- start the mobile bundler with `npm run dev:mobile`
- run the mobile app from `apps/mobile`

If you set `GATEWAY_ANDROID_APK_PATH` to a built APK, the desktop dashboard exposes a direct Android download plus a scannable QR code for the phone. The old lower-level startup path still exists as `npm run dev:desktop-stack` if you want raw terminal control.

The current product priority is to make the phone feel like a persistent remote operator console for Codex rather than a thin remote terminal.

Use [START_HERE.md](/home/adamgoodwin/code/agents/codex_adam_connect/START_HERE.md) for the exact setup and validation order.
