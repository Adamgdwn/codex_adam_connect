# Roadmap

## Now

- make Freedom Companion feel like a persistent remote operator console for desktop Freedom/Codex
- harden pairing persistence and recovery so the phone stays usable across normal desktop restarts
- make the default `Operator` chat the low-friction path for quick voice and text turns
- improve duplex voice/TTS reliability, visible state, interruption quality, and safe auto-send behavior
- improve shared phone/desktop status, retry messaging, and chat readability
- reduce monolith risk in the mobile UI by stopping further growth of `apps/mobile/src/app/AppShell.tsx`
- make the `Build` surface useful enough for real project kickoff from the phone, not just session management

## Next

- make wake-on-request reliable enough that the homebase can sleep without losing the remote operator path
- make external report delivery useful and safe with trusted recipients and manual-send email
- add richer chat readability and management features: previews, timestamps, search, and clearer empty states
- add richer host settings and reconnect flows
- improve transcript quality, confirmation for risky voice-send behavior, and TTS cleanup
- finish iOS build validation and packaging

## Later

- optional approval-gated mode
- richer multi-host support
- evaluate whether to expose a ChatGPT-native frontend in addition to the standalone app

## Checkpoint Notes

### Just Completed

- the native Electron shell became the supported desktop GUI, with the browser page kept as a fallback install and recovery surface
- one-command launch and Linux launcher install path landed
- the phone now has persistent pairing tokens, a stable restart-safe pairing code, and Freedom-branded `Overview`, `Build`, and `Talk` surfaces
- the desktop and phone share richer session/status recovery behavior than the original MVP
- the mobile voice loop regained real barge-in behavior and richer spoken-reply voice selection metadata

### Coming Next

- complete one more real-phone acceptance pass focused on the operator loop
- tighten duplex voice send/reply behavior so the phone feels like a natural coworker console without self-hearing
- break up the largest mixed-purpose mobile UI/state files while preserving current behavior
