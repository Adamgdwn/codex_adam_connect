# Status

## Checkpoint: 2026-04-11

### What Just Completed

- the supported desktop GUI is now the browser dashboard served by the gateway root route
- `npm run launch` starts the local services and opens that dashboard automatically
- the dashboard now shows pairing, Tailscale health, recent sessions, recent devices, QR onboarding, and Android APK download links
- a Linux desktop launcher installer now exists through `npm run app:desktop:install-launcher`
- the docs were updated to reflect the supported dashboard-first flow
- the phone now has a default `Operator` chat path, safer voice auto-send review, and clearer message rendering
- stale phone tokens can now enter a repair flow that preserves saved desktop settings instead of forcing a full cold start

### What Is Stable Right Now

- `npm run launch`
- `npm run launch:no-open`
- `npm run app:desktop`
- `npm run app:desktop:start`
- `npm run app:desktop:install-launcher`
- the browser dashboard and phone install page
- Android APK serving from the desktop dashboard when a built artifact exists
- stable pairing codes across normal desktop restarts
- default operator-chat recovery and pinned operator sorting on the phone

### What Is Still In Progress

- `apps/desktop-shell` is currently a scaffold under evaluation, not the supported desktop path
- iOS still needs real-device validation and packaging validation
- real-phone acceptance should be rerun against the latest operator-loop flow before calling the release path settled
- `apps/mobile/src/store/appStore.ts` is still a large mixed-purpose state coordinator that needs further decomposition

### What Should Happen Next

1. Run a full real-phone operator-loop pass, including repair-mode recovery and risky-voice-review behavior.
2. Keep decomposing the largest mixed-purpose mobile state code while preserving the current operator flow.
3. Decide whether to finish the native-shell runtime or keep the browser dashboard as the long-term desktop surface.
4. Validate iOS build and packaging on a real Apple build environment.
