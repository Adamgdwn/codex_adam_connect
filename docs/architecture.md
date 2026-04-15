# Architecture Overview

## Summary

Adam Connect is the local-first runtime bridge behind the Freedom companion experience. A paired mobile client talks to a local gateway, and the desktop host bridges those chat requests into the local Codex app-server. The current supported desktop surface is the Electron shell opened by `npm run launch`.

The current near-term architecture priority is the `Operator loop`: keep one persistent, low-friction phone-to-desktop path healthy before adding broader product surface area.

## Components

- `apps/mobile`: Freedom-branded pairing, overview/build/talk surfaces, continuous voice loop, and streamed spoken replies
- `apps/gateway`: device pairing, token auth, session/message persistence, realtime websocket fan-out
- `apps/wake-relay`: optional low-power LAN wake bridge that can send wake-on-LAN packets while the main workstation sleeps
- `apps/desktop-extension`: host registration, Codex auth checks, Codex app-server supervision, message execution
- browser dashboard: fallback install/recovery/admin surface served from the gateway root route
- `apps/desktop-shell`: supported native-shell entrypoint for the desktop operator console

## Data Flow

1. desktop host registers with the gateway and receives a host token plus pairing code
2. phone completes pairing and receives a long-lived device token
3. phone restores the default `Operator` session or creates a named chat bound to an approved root
4. phone posts a user message or live voice turn after endpointing
5. desktop host polls for pending work, starts or resumes a Codex thread, and forwards the turn
6. Codex app-server emits message deltas and completion notifications
7. desktop host writes assistant deltas back to the gateway
8. gateway streams session, message, and host updates back to the paired phone over websocket
9. optional outbound delivery reuses completed assistant output and sends it externally through gateway-local provider credentials
10. optional wake-on-request is handled by the wake relay, not the sleeping workstation gateway

## Trust Boundaries

- the phone is a trusted owner device after pairing
- the gateway is a local coordination service, not a public control plane
- the wake relay is a narrowly-scoped power-control surface and should only accept a wake-scoped token
- the desktop host is the policy boundary for approved roots and Codex access
- Codex auth remains on the desktop machine

## Key Decisions

- pairing replaces the old demo-auth flow
- the phone never stores an OpenAI API key
- local Codex login is the primary auth dependency for assistant turns
- approved roots constrain chat session workspaces
- the Electron shell is the supported desktop GUI and the browser dashboard remains a fallback install/recovery surface
- the phone should feel like a Freedom companion, while Connect remains the runtime/transport layer underneath
- stale device-token recovery should prefer repair of the existing phone/desktop link rather than a full disconnect-first flow
- voice sessions must remain explicitly user-controlled and should pause for review on risky transcripts
- outbound provider secrets stay on the desktop gateway machine only and never move to the phone
- wake-on-request must not depend on the workstation gateway still running after the workstation is asleep

## Checkpoint Summary

### Completed

- one-command launch through `npm run launch`
- browser dashboard with install, recovery, and APK actions
- Linux launcher installation script for the supported Freedom desktop shell path

### Next

- validate the operator loop on a real phone again
- continue decomposing the largest mixed-purpose mobile files while preserving current behavior
- keep tightening the supported shell and companion instead of widening surface area prematurely
- harden the wake relay deployment story and external delivery observability
