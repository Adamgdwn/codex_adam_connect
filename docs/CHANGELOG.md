# Change Log

## Unreleased

- replaced the old one-shot voice helper with a continuous voice session loop that keeps listening between turns, shows live transcript/audio state, starts TTS from streamed assistant deltas, and stops cleanly on barge-in
- made Android voice playback more reliable by pausing speech recognition while reply audio is starting, then resuming the live voice loop immediately after each spoken reply
- added an Expo speech-output fallback on Android so spoken replies no longer depend on a single flaky phone-local TTS backend
- stopped fresh voice turns from sitting behind a long-running busy state by actively interrupting the current run before auto-sending the next captured voice turn
- stopped the dashboard APK install links from opening a useless blank browser tab by turning them into direct downloads with explicit Android attachment headers
- made live voice turns less trigger-happy on short pauses by buffering a finalized transcript briefly and merging immediate continuation speech into the same turn
- added a device-side `Test Spoken Reply` control and richer Android TTS engine/voice diagnostics so reply-audio failures can be separated from live voice-loop bugs
- added a mobile spoken-reply voice picker plus a more accessible global reply-style control so voice behavior can be tuned without leaving the operator console
- added a wake-on-request path using a separate always-on LAN wake relay so the workstation can sleep without killing the remote operator path
- added trusted outbound email recipients plus a `Send externally` flow that reuses completed assistant replies without making a fresh model call
- added a confirmation-based natural email path so spoken requests like “email me that link” can prepare an outbound draft automatically and wait for a final spoken or tapped confirmation before sending
- preserved explicitly requested email subject/body details in the prepared draft so simple outbound email tests do not lose the requested metadata
- shifted the chat back toward a voice-native default so manual text compose stays behind the settings gear unless you deliberately open it or already have a manual draft in progress
- added a live microphone mute toggle for noisy environments so the voice session can stay open without continuously listening to your side
- added a spinning in-chat working bubble so long-running turns are visibly active instead of feeling hung
- added Resend-based outbound email configuration, a wake relay deployment doc, and explicit desktop `.env` hooks for both features
- removed the idle `Voice Loop` chat panel so it only takes space when a live voice session or spoken draft is actually active, and clarified that newly-added outbound email env vars require a desktop restart before the phone will see them
- made the chat `Stop` action behave like a recovery control as well as a busy-run interrupt, so users can stop or reset the best available chat even when mobile session state has drifted
- made the chat `Stop` action end the live phone-side voice loop as well, so manual stop no longer leaves the microphone listening in the background
- hardened Android recognizer shutdown by requesting a clean `stop()` before forcing an `abort()`, which should reduce stuck-listening and audio-focus conflicts during spoken replies
- stopped trusting only JS voice-session state when shutting Android recognition down, and now force-clear the native recognizer before spoken-reply tests and reply playback recovery
- trimmed the mobile `Chats` view back to the compact shell chrome so the session list regains vertical space instead of reopening the larger host header
- added a dedicated mobile `Voice Loop` state panel plus runtime tuning knobs for interruption thresholds, backchannel tolerance, and early TTS chunking
- reworked the mobile chat layout so messages own the main scroll area, the composer stays anchored, and the `Talk To Codex` control stays in the fixed top chrome
- collapsed the mobile host/status/navigation chrome behind a header toggle, kept `Talk To Codex` persistent in the top-right, and surfaced clearer live voice readiness in the header
- stopped voice auto-send from failing silently when Codex is already busy by keeping the transcript in the composer and showing an explicit waiting message
- resumed queued voice sends automatically when the active Codex run finishes, and disabled the chat `Send` action while the current target chat is still busy
- fixed stale `running` chats that could survive a lost desktop run handle by letting the desktop recover orphaned stop requests and clear the gateway session state
- stopped desktop `turn/interrupt` requests from hanging forever by timing them out and letting stop retries recover instead of wedging the chat in `busy`/`stopping`
- fixed a fast-turn race in the desktop Codex bridge so short replies no longer disappear into a forever-`running` chat with no visible desktop output
- reduced mobile chat chrome further by switching the chat view toward a true messaging layout with a compact top bar, settings icon, tighter message spacing, and a slimmer composer
- made the desktop host auto-discover the Codex CLI from common VS Code extension installs so `spawn codex ENOENT` is less likely when launched outside an interactive shell
- stopped Android startup from touching Firebase messaging when `google-services.json` is absent, so non-FCM builds no longer crash on launch
- made phone refresh easier to reach by adding a shared refresh button and more reliable pull-to-refresh behavior across Host, Chats, and Chat
- added a mobile project wizard that starts a project chat with a structured kickoff prompt, project mode, desired output, and reply style
- wired response-style controls end to end so phone-selected styles now shape the desktop Codex turn prompt
- added Android-first FCM groundwork plus a current-device settings UI for enabling background updates, tuning notification events, testing delivery, and revoking trusted devices
- promoted the Electron shell into the supported desktop entrypoint and made `npm run launch` prefer the native operator console when a GUI session is available
- reshaped the desktop control surface around `Operator`, `Activity`, `Devices`, `Workspaces`, and `Settings`
- added shared status enums and richer session/device metadata for operator readiness, repair state, run state, session kind, response style, and notification events
- replaced websocket token query auth with short-lived realtime tickets
- added device-management groundwork for rename, revoke, push-token registration, notification preferences, repair counts, and gateway audit events
- improved the mobile chats list with search, previews, kind labels, pinned labels, and last-activity timestamps
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
