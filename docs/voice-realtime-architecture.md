# Realtime Voice Architecture Note

## Current Assessment

Before this upgrade, Adam Connect voice behaved like a one-shot transcript helper:

1. the phone started on-device speech recognition
2. the recognizer returned one final transcript
3. the transcript was dropped into the normal chat composer
4. the existing text message flow sent that turn to Codex
5. assistant text streamed back over websocket
6. optional TTS waited for the completed assistant message and then spoke the full reply

That created the wrong product shape for a voice-first operator console. The root cause was not microphone polish. The real issue was that voice had no long-lived session state, no live transcript model, no early speech output, and no interruption path that could stop a reply and immediately accept a new turn.

## Least Disruptive Upgrade Path

The codebase already had one useful realtime primitive: the mobile websocket that streams session and message updates from the gateway. The least disruptive path was therefore:

- keep the existing pairing, gateway, websocket, and desktop Codex bridge intact
- replace the mobile one-shot voice wrapper with a continuous voice session loop
- drive turn-taking from live STT events on device
- drive assistant speech from the existing streamed assistant deltas instead of waiting for full completion
- use the existing session stop path for barge-in instead of introducing a second interrupt channel

This keeps the current trust boundary the same: the phone still does not hold model credentials, and the desktop remains the Codex execution boundary.

## Implemented Session Layers

### Audio input

- `VoiceService` now supports a streaming session instead of resolving one final transcript and tearing down.
- The mobile store keeps recognition active across turns and records live transcript plus audio level.
- Recognition restarts automatically on recoverable session drops.

### Turn handling

- `voiceSessionMachine.ts` introduces explicit voice phases:
  `idle`, `connecting`, `listening`, `user-speaking`, `processing`, `assistant-speaking`, `interrupted`, `reconnecting`, `review`, `error`
- Short acknowledgements such as `yeah`, `okay`, and `uh huh` are treated as backchannel instead of automatic interruption.
- Substantive speech while the assistant is talking triggers a stop request through the existing session stop path.
- The recognizer now stays alive during spoken replies so explicit barge-in can work again while Freedom is speaking.
- Interruption filtering is now stricter about likely assistant-echo pickup, so Freedom is less likely to hear its own spoken reply and stop itself.

### Assistant speech

- `AssistantSpeechRuntime` converts streaming assistant deltas into sentence-sized TTS chunks.
- The phone begins speaking once enough text is available instead of waiting for the full response.
- TTS is cancelled immediately on confirmed barge-in.

### UI and observability

- The chat screen now exposes a dedicated `Voice Loop` panel with phase, live transcript, assistant preview, audio meter, turn counts, interruption counts, reconnect counts, and latest round-trip timing.
- The header voice control now starts and ends a continuous session instead of acting like a one-shot mic capture.
- The spoken-reply voice picker now surfaces accent, engine, quality, and any safe style or gender hints the device actually exposes, so voice choice no longer requires pure trial and error.

## Safety Notes

- Risky or long transcripts still pause for review instead of silent auto-send.
- Realtime voice remains gated by mobile runtime config so the behavior can be tuned or disabled per build.
- The upgrade does not add new remote execution capability; it changes how quickly voice turns enter the existing approved-root Codex flow.

## Reference Concepts

This implementation intentionally mirrors the architectural direction recommended in the brief:

- LiveKit agent starters: separate connection/session UI states from active conversation UI, and treat voice as a session rather than a button click
- LiveKit turn docs: use explicit turn states, endpointing delay, interruption detection, and false-interruption tolerance as the design target
- Pipecat: keep transport, speech understanding, reasoning, speech output, and UI/observability as separate layers even in a smaller in-repo implementation
