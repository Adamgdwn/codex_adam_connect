# Change Log

## Unreleased

- replaced the demo `summarize_file` slice with paired chat sessions for the local Codex CLI
- added gateway websocket streaming for host status, sessions, and message deltas
- added a desktop Codex app-server bridge with login-state reporting
- replaced mobile demo-auth with pairing, stored device tokens, chat UI, and voice/TTS hooks
- added local governance fallback so repo preflight passes without external setup
- added a richer browser dashboard with pairing, Tailscale, recent-session, recent-device, QR, and APK install surfaces
- added a stable desktop overview API at `/api/desktop/overview`
- added a one-command launcher plus Linux desktop launcher installation for the supported desktop GUI path
- added a native desktop-shell scaffold for future evaluation, but kept the browser dashboard as the supported surface for now

## End Of Day Summary

### What Completed

- the project now has a supported desktop GUI and launcher path that is easier to use than raw terminal startup
- the install and onboarding flow is strong enough to hand to a phone user with less manual setup
- the docs now reflect the supported launch path and current status

### What Is Next

- run another end-to-end real-phone validation pass
- resolve the native-shell runtime path before promoting it to a supported command
- validate iOS packaging and release-oriented distribution next
