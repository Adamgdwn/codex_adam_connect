# Architecture Overview

## Summary

Adam Connect is a local-first remote-control companion for Codex. A paired mobile client talks to a local gateway, and the desktop host bridges those chat requests into the local Codex app-server. The current supported desktop surface is the Electron shell opened by `npm run launch`.

The current near-term architecture priority is the `Operator loop`: keep one persistent, low-friction phone-to-desktop path healthy before adding broader product surface area.

## Components

- `apps/mobile`: pairing, host status, chat sessions, text input, push-to-talk, optional TTS
- `apps/gateway`: device pairing, token auth, session/message persistence, realtime websocket fan-out
- `apps/desktop-extension`: host registration, Codex auth checks, Codex app-server supervision, message execution
- browser dashboard: fallback install/recovery/admin surface served from the gateway root route
- `apps/desktop-shell`: supported native-shell entrypoint for the desktop operator console

## Data Flow

1. desktop host registers with the gateway and receives a host token plus pairing code
2. phone completes pairing and receives a long-lived device token
3. phone restores the default `Operator` session or creates a named chat bound to an approved root
4. phone posts a user message or reviewed voice transcript
5. desktop host polls for pending work, starts or resumes a Codex thread, and forwards the turn
6. Codex app-server emits message deltas and completion notifications
7. desktop host writes assistant deltas back to the gateway
8. gateway streams session, message, and host updates back to the paired phone over websocket

## Trust Boundaries

- the phone is a trusted owner device after pairing
- the gateway is a local coordination service, not a public control plane
- the desktop host is the policy boundary for approved roots and Codex access
- Codex auth remains on the desktop machine

## Key Decisions

- pairing replaces the old demo-auth flow
- the phone never stores an OpenAI API key
- local Codex login is the primary auth dependency for assistant turns
- approved roots constrain chat session workspaces
- the Electron shell is the supported desktop GUI and the browser dashboard remains a fallback install/recovery surface
- stale device-token recovery should prefer repair of the existing phone/desktop link rather than a full disconnect-first flow
- voice auto-send must remain explicitly user-controlled and should pause for review on risky transcripts

## Checkpoint Summary

### Completed

- one-command launch through `npm run launch`
- browser dashboard with richer desktop state and install actions
- Linux launcher installation script for the supported dashboard path

### Next

- validate the operator loop on a real phone again
- continue decomposing the largest mixed-purpose mobile files while preserving current behavior
- finish or retire the native-shell scaffold based on runtime validation
