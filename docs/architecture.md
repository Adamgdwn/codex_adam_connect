# Architecture Overview

## Summary

Adam Connect is a local-first remote-control companion for Codex. A paired mobile client talks to a local gateway, and the desktop host bridges those chat requests into the local Codex app-server. The current supported desktop surface is the browser dashboard opened by `npm run launch`.

## Components

- `apps/mobile`: pairing, host status, chat sessions, text input, push-to-talk, optional TTS
- `apps/gateway`: device pairing, token auth, session/message persistence, realtime websocket fan-out
- `apps/desktop-extension`: host registration, Codex auth checks, Codex app-server supervision, message execution
- browser dashboard: desktop-facing GUI served from the gateway root route with install/onboarding and live host state
- `apps/desktop-shell`: native-shell scaffold under active evaluation, not yet the primary supported launch path

## Data Flow

1. desktop host registers with the gateway and receives a host token plus pairing code
2. phone completes pairing and receives a long-lived device token
3. phone creates a chat session bound to an approved root
4. phone posts a user message
5. desktop host polls for pending work, starts or resumes a Codex thread, and forwards the turn
6. Codex app-server emits message deltas and completion notifications
7. desktop host writes assistant deltas back to the gateway
8. gateway streams session and message updates to the paired phone over websocket

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
- the browser dashboard remains the supported desktop GUI until the native-shell runtime path is proven

## Checkpoint Summary

### Completed

- one-command launch through `npm run launch`
- browser dashboard with richer desktop state and install actions
- Linux launcher installation script for the supported dashboard path

### Next

- validate the dashboard-first flow on a real phone again
- finish or retire the native-shell scaffold based on runtime validation
