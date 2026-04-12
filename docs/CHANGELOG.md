# Change Log

## Unreleased

- synced local `AGENTS.md` with the richer GitHub guidance so governance, product priorities, adjacency checks, and done standards match the current repo intent
- reframed the near-term roadmap around the `Operator loop`: persistent pairing/recovery, default operator chat, reliable voice/TTS, and shared phone/desktop recovery behavior
- split the mobile shell into smaller screen and component modules so new operator-loop fixes do not keep piling into one monolith
- pinned the default `Operator` chat to the top of the phone UI and improved message readability with clearer roles, timestamps, and code-block rendering
- added a pairing-repair path that keeps saved desktop settings when the phone token becomes stale, so reconnecting is faster than starting over
- made voice auto-send safer by pausing for review on risky or long transcripts even when auto-send is enabled
- cleaned up TTS output so spoken replies avoid raw markdown and fenced code formatting
- fixed `npm run launch` so it loads `.env` before registering approved roots
- added a release Android build path and made the dashboard prefer `app-release.apk` for phone installs
- removed forced APK attachment headers so Android browsers can hand off to the installer more directly
- switched the Android app back to the classic host bootstrap path for better release-launch stability
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

- run another end-to-end real-phone validation pass focused on the operator loop
- verify the new pairing-repair and voice-review paths on a real phone
- keep tightening voice/send/reply behavior, chat readability, and shared recovery messaging
- continue reducing the size and responsibility of the remaining mixed-purpose mobile state code
