# Runbook

## Purpose

Operate the local gateway and desktop host so a paired phone can chat with the local Codex CLI.

## Common Failures

- `Pairing code not found`: verify the typed code first, then restart the desktop host only if the saved code is genuinely stale
- `Codex is not logged in`: run `codex login --device-auth`
- mobile websocket disconnects: verify the desktop URL, `GATEWAY_HOST`, and Tailscale path
- session stuck in `running`: inspect desktop host logs and restart the host if the local app-server exited
- `This phone needs to repair its desktop link`: keep the saved desktop URL, then reconnect with the stable pairing code instead of doing a full disconnect-first setup
- wake fails while the workstation is asleep: verify the wake relay is online, the relay token matches, and the target MAC/broadcast settings are correct
- outbound email fails: verify `RESEND_API_KEY`, the verified sender domain, and the `OUTBOUND_EMAIL_FROM` address

## Recovery

1. restart `npm run launch`
2. verify `codex login status`
3. refresh the mobile app
4. if the phone enters repair mode, reconnect using the saved desktop URL and pairing code
5. only fall back to a full disconnect and re-pair if repair does not recover the link

## Dependencies

- local Codex CLI
- local Codex login state
- Node.js
- React Native build toolchain
- private network reachability between phone and desktop
- optional always-on LAN node for the wake relay
- optional outbound email provider credentials on the gateway machine

## Status

### Completed

- the supported operational path is now the dashboard-first launcher, not only the raw desktop stack
- Linux launcher installation is scripted if a menu entry is desired

### Next

- capture one more full real-device recovery drill using the operator loop
- decide whether the native-shell scaffold becomes part of operations or stays internal
