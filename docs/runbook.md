# Runbook

## Purpose

Operate the local gateway and desktop host so a paired phone can chat with the local Codex CLI.

## Common Failures

- `Pairing code not found`: restart the desktop host and use the new pairing code
- `Codex is not logged in`: run `codex login --device-auth`
- mobile websocket disconnects: verify the desktop URL, `GATEWAY_HOST`, and Tailscale path
- session stuck in `running`: inspect desktop host logs and restart the host if the local app-server exited

## Recovery

1. restart `npm run launch`
2. verify `codex login status`
3. refresh the mobile app
4. if needed, disconnect and pair again

## Dependencies

- local Codex CLI
- local Codex login state
- Node.js
- React Native build toolchain
- private network reachability between phone and desktop

## Status

### Completed

- the supported operational path is now the dashboard-first launcher, not only the raw desktop stack
- Linux launcher installation is scripted if a menu entry is desired

### Next

- capture one more full real-device recovery drill using the dashboard flow
- decide whether the native-shell scaffold becomes part of operations or stays internal
