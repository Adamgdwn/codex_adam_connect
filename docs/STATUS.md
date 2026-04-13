# Status

## Checkpoint: 2026-04-11

### What Just Completed

- the supported desktop GUI is now the Electron shell
- `npm run launch` starts the local services and opens the native shell automatically when a GUI session is available
- the shell-facing desktop surface now shows `Operator`, `Activity`, `Devices`, `Workspaces`, and `Settings`
- a Linux desktop launcher installer now exists through `npm run app:desktop:install-launcher`
- the gateway now issues short-lived realtime tickets for websocket auth instead of reusing long-lived device tokens directly
- the phone now has a default `Operator` chat path, safer voice auto-send review, clearer message rendering, and a tighter messaging-style chat layout
- stale phone tokens can now enter a repair flow that preserves saved desktop settings instead of forcing a full cold start
- busy chats and `Stop` recovery now clear more reliably even after desktop-side run-handle loss or app-server interrupt stalls

### What Is Stable Right Now

- `npm run launch`
- `npm run launch:no-open`
- `npm run app:desktop`
- `npm run app:desktop:start`
- `npm run app:desktop:install-launcher`
- the native shell plus the fallback browser install/recovery page
- Android APK serving from the desktop dashboard when a built artifact exists
- stable pairing codes across normal desktop restarts
- default operator-chat recovery and pinned operator sorting on the phone
- mobile `Stop` and busy-state recovery across stale desktop runs
- compact chat-first phone UI with persistent top-right talk/settings controls

### What Is Still In Progress

- iOS still needs real-device validation and packaging validation
- real-phone acceptance should be rerun against the latest operator-loop flow before calling the release path settled
- `apps/mobile/src/store/appStore.ts` is still a large mixed-purpose state coordinator that needs further decomposition

### What Should Happen Next

1. Run a full real-phone operator-loop pass, including repair-mode recovery and risky-voice-review behavior.
2. Keep decomposing the largest mixed-purpose mobile state code while preserving the current operator flow.
3. Validate iOS build and packaging on a real Apple build environment.
4. Keep widening device-management, notification, and recovery coverage from the new shell-first baseline.
