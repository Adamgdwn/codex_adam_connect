# Adam Connect

Adam Connect turns a paired phone into a remote chat surface for the local Codex CLI running on this computer.
It now also supports a natural-feeling live voice loop, so your desktop coding partner can actually feel like it is in your pocket instead of trapped behind a one-shot mic button.

## Status Snapshot

See [docs/STATUS.md](/home/adamgoodwin/code/agents/codex_adam_connect/docs/STATUS.md) for the current checkpoint handoff.

## Current Checkpoint

This repository is the active home for the Adam Connect work:

- repo path: `/home/adamgoodwin/code/agents/codex_adam_connect`
- supported desktop entrypoint: `npm run launch`
- supported desktop UI: the Electron shell
- intended phone role: trusted remote operator console for Codex running on this desktop

The Electron shell now includes the desktop dashboard inside the app and should expose:

- `Operator`
- `Phone Setup`
- `Activity`
- `Devices`
- `Workspaces`
- `Settings`

The `Phone Setup` flow is meant to stay inside the app now, with:

- a `Phone Setup` tab in the desktop shell
- a compact QR card on the `Operator` tab
- a larger QR in the `Phone Setup` tab
- the browser reserved mainly for APK download and recovery links

## Known Working Areas

- desktop launcher installs and launches through the Linux desktop entry
- the Electron shell is the primary GUI path
- the gateway serves the updated desktop dashboard with the in-app QR code and `Phone Setup` tab
- pairing codes remain stable across normal restarts
- saved device repair flows exist for stale phone tokens
- mobile sessions support operator chat plus project chat creation
- response style controls and project wizard scaffolding are in place
- realtime websocket auth uses short-lived tickets instead of long-lived device tokens
- the mobile app now runs a continuous voice session loop with live transcript, early spoken playback, and barge-in handling on top of the existing websocket transport
- Android voice playback now pauses recognition while spoken replies start, then resumes the voice loop automatically for the next turn
- Android spoken replies now prefer Expo speech output first, then fall back to the older Android text-to-speech module if needed

## Known Issues

- the Android phone can still show `Realtime connection dropped...` and may require reconnect or repair
- the desktop shell has had startup race issues when the desktop host tries to start before the gateway is ready
- stale Adam Connect background processes previously caused the shell to render older dashboard code after relaunch
- local Codex availability can still fail if the desktop cannot spawn `codex`
- transport is still tailnet-first `http/ws`, not a finished `https/wss` product-grade deployment

## Most Recent Fixes

- launcher cleanup now force-stops stale Adam Connect processes and clears port `43111` before relaunch
- the shell supervisor now waits for gateway health before starting the desktop host
- the desktop dashboard now includes an in-app `Phone Setup` tab and in-app QR surfaces
- shell focus behavior was reduced so the app behaves more like a normal desktop window
- state directories for the gateway and desktop host were made explicit so restarts keep a consistent identity
- mobile voice turns now interrupt an already-busy run instead of sitting behind a stale `busy` banner

## Next Steps

### Immediate next session

1. Open this repo in the correct folder: `/home/adamgoodwin/code/agents/codex_adam_connect`
2. Launch Adam Connect from the desktop icon or `npm run launch`
3. Confirm the shell shows the `Phone Setup` tab and the compact QR on `Operator`
4. Pair or repair the phone against the current Tailscale URL and current pairing code
5. Reproduce the mobile `Realtime connection dropped...` issue while watching live desktop logs

### Highest-priority debugging

1. Trace the realtime websocket path end to end:
   mobile `createRealtimeTicket` -> gateway `/realtime/ticket` -> websocket `/ws` upgrade -> subscription broadcast
2. Confirm whether the drop is caused by:
   mobile network reachability,
   failed websocket upgrade,
   ticket expiry timing,
   host/gateway restarts,
   or missing host status broadcasts
3. Add temporary logging around websocket ticket creation, upgrade success, socket close reason, and reconnect attempts
4. Validate reconnect from a real phone after a fresh desktop launch, not against a stale background stack

### Product follow-up after realtime is stable

1. validate the new realtime voice loop on a real phone and tune interruption thresholds if needed
2. improve mobile/desktop recovery messaging
3. finish shell-side device settings and device lifecycle controls
4. complete Android notification validation with a real device
5. harden packaging and release flow for Pop!_OS/Linux

## Recommended Commands For The Next Window

- preflight: `bash scripts/governance-preflight.sh`
- launch shell: `npm run launch`
- install Linux launcher: `npm run app:desktop:install-launcher`
- mobile bundler: `npm run dev:mobile`
- typecheck: `npm run typecheck`
- build: `npm run build`
- inspect launcher log: `tail -n 120 ~/.local/state/adam-connect/desktop-launch.log`
- inspect gateway page: `curl -s http://127.0.0.1:43111/ | less`

## Notes For Continuation

- if the desktop shell appears to show old UI again, check whether a stale process is still holding port `43111`
- if the phone pairs but realtime immediately drops, treat the websocket path as the primary bug, not the QR or pairing UI
- if the shell says Codex is unavailable, verify the desktop can actually run `codex`
- if a future Codex session opens in the wrong repository, switch back to `codex_adam_connect` before making changes

### Completed

- paired phone chat flow is live through the gateway and desktop Codex bridge
- the Electron desktop shell is now the supported desktop entrypoint
- the shell centers the `Operator` flow and exposes `Operator`, `Activity`, `Devices`, `Workspaces`, and `Settings`
- `npm run launch` now prefers the native shell when a GUI session is available, while `npm run launch:no-open` remains the headless path
- `npm run app:desktop:install-launcher` installs a Linux desktop-menu launcher for the native operator console
- the phone keeps a default `Operator` chat path for quick remote turns
- the phone now includes a project-start wizard that can kick off a project chat with goal, output shape, template, and reply style in one step
- pairing codes stay stable across normal desktop restarts, and stale phone tokens can enter a repair flow instead of a full cold start
- realtime websocket auth now uses short-lived tickets instead of passing long-lived device tokens directly
- paired devices now track push readiness, notification preferences, revoke state, repair history, and audit events
- response style preferences now flow from the phone through the gateway into desktop Codex turns

### Next

- validate the operator loop on a real phone end to end again after this checkpoint
- keep improving voice send/reply behavior, readable chat output, and shared phone/desktop recovery messaging
- either finish promoting the Electron desktop-shell scaffold into a supported launch path or remove it if the browser-first experience stays better
- validate iOS packaging and real-device behavior
- harden packaging, release, and smoke coverage around the desktop surface

## What It Does

- `apps/gateway`: local network API plus realtime websocket fan-out
- `apps/desktop-extension`: desktop host runtime that supervises local Codex app-server
- `apps/mobile`: React Native companion for pairing, chat sessions, text, and continuous bidirectional voice sessions

## Core Flow

1. the desktop host starts and registers itself with the gateway
2. the desktop host generates a pairing code
3. the phone pairs with that code and receives a long-lived device token
4. the phone repairs or reconnects using that saved URL plus token when possible
5. the phone uses a default `Operator` chat or creates named chats scoped to approved desktop roots
5. the phone sends text or live voice turns
6. the desktop host relays that turn to the local Codex app-server
7. the gateway streams host status, session updates, and assistant message deltas back to the phone

## Voice Loop

The phone no longer treats voice as a one-shot transcript helper. The main voice path is now:

1. start a voice session from the mobile header
2. the phone keeps speech recognition active across turns
3. interim transcript appears live while you speak
4. finalized speech is sent through the existing chat session flow
5. assistant deltas stream back over websocket
6. the phone starts speaking sentence-sized chunks as soon as enough reply text arrives
7. if you interrupt, TTS stops and the current run is cancelled so the next turn can begin

Risky or unusually long transcripts still pause for review instead of auto-sending silently.
On Android, Adam Connect now prefers Expo speech for reply audio and keeps the older text-to-speech module as a fallback path.

## Auth Model

- the phone does not store an OpenAI API key
- the desktop host depends on the local Codex CLI login state
- if Codex is logged out, the host reports that clearly and the recovery path is `codex login --device-auth`

## Run It

- copy `.env.example` to `.env`
- set `DESKTOP_APPROVED_ROOTS` to one or more absolute roots
- optionally set `MOBILE_DEFAULT_BASE_URL` to prefill the desktop URL in local mobile builds
- optionally tune the voice loop:
  `MOBILE_VOICE_SESSION_ENABLED`, `MOBILE_VOICE_INTERRUPT_MIN_CHARS`, `MOBILE_VOICE_BACKCHANNEL_MAX_WORDS`, `MOBILE_VOICE_TTS_MIN_CHARS`
- optional for Android background updates: add `apps/mobile/android/app/google-services.json` and set `FCM_SERVER_KEY`
- launch the desktop app with `npm run launch`
- the launcher opens the native shell when a GUI session is available
- optional on Linux: install a menu launcher with `npm run app:desktop:install-launcher`
- start the mobile bundler with `npm run dev:mobile`
- run the mobile app from `apps/mobile`

If you set `GATEWAY_ANDROID_APK_PATH` to a built APK, the desktop install/recovery surface exposes a direct Android download plus a scannable QR code for the phone. The old lower-level startup path still exists as `npm run dev:desktop-stack` if you want raw terminal control.

The current product priority is to make the phone feel like a persistent remote operator console for Codex rather than a thin remote terminal.

Use [START_HERE.md](/home/adamgoodwin/code/agents/codex_adam_connect/START_HERE.md) for the exact setup and validation order.
See [docs/voice-realtime-architecture.md](/home/adamgoodwin/code/agents/codex_adam_connect/docs/voice-realtime-architecture.md) for the voice upgrade assessment and implementation note.
