# Status

## Checkpoint: 2026-04-11

### What Just Completed

- the supported desktop GUI is now the browser dashboard served by the gateway root route
- `npm run launch` starts the local services and opens that dashboard automatically
- the dashboard now shows pairing, Tailscale health, recent sessions, recent devices, QR onboarding, and Android APK download links
- a Linux desktop launcher installer now exists through `npm run app:desktop:install-launcher`
- the docs were updated to reflect the supported dashboard-first flow

### What Is Stable Right Now

- `npm run launch`
- `npm run launch:no-open`
- `npm run app:desktop`
- `npm run app:desktop:start`
- `npm run app:desktop:install-launcher`
- the browser dashboard and phone install page
- Android APK serving from the desktop dashboard when a built artifact exists

### What Is Still In Progress

- `apps/desktop-shell` is currently a scaffold under evaluation, not the supported desktop path
- iOS still needs real-device validation and packaging validation
- real-phone acceptance should be rerun against the latest dashboard flow before calling the release path settled

### What Should Happen Next

1. Run a full real-phone pairing and chat pass from the dashboard flow.
2. Decide whether to finish the native-shell runtime or keep the browser dashboard as the long-term desktop surface.
3. Validate iOS build and packaging on a real Apple build environment.
4. Tighten release and smoke coverage around the supported desktop surface.
