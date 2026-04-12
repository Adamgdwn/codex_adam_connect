# Agent Instructions — Adam Connect

## Before You Touch Code

```bash
bash scripts/governance-preflight.sh
```

Read `project-control.yaml`. Note open exceptions relevant to your task. Proceed only if preflight passes or gaps are explicitly accepted.

---

## How to Think Through a Fix

Every change touches a system, not just a line. Before writing anything, answer these four questions in your reasoning:

1. **What is the actual root cause?** Not the symptom. Trace back one level further than where the error appears.
2. **What else relies on this?** Check callers, subscribers, and downstream state. In this repo that means: does the store action affect WebSocket state, TTS, or session selection? Does the gateway route affect mobile pairing or streaming?
3. **What breaks if I'm wrong?** Identify the worst-case failure mode. State it explicitly before proceeding.
4. **Is there a simpler path that still solves the root cause?** Prefer fewer moving parts.

Do this reasoning before opening any file to edit.

---

## Architecture Map (Keep in Mind)

```
apps/gateway          → local API + WebSocket fan-out (port 43111)
apps/desktop-extension → supervises Codex CLI app-server, heartbeat to gateway
apps/desktop-shell    → Electron wrapper (in-progress, may be removed)
apps/mobile           → React Native: AppShell.tsx + appStore.ts + voice/tts services
packages/shared       → shared TypeScript types (ChatMessage, ChatSession, HostStatus, StreamEvent)
```

Key invariants:
- The phone never holds an OpenAI API key. Auth lives on the desktop via `codex login`.
- Device tokens are long-lived. Pairing code is one-time. Don't conflate them.
- `appStore.ts` is the single source of truth for mobile state. Side effects belong in store actions, not components.
- WebSocket fan-out is the realtime channel. REST is for bootstrapping and mutations only.

---

## Mobile — Specific Rules

- `AppShell.tsx` is a known decomposition target. When touching it, extract the view you're working on into its own component. Don't add to the monolith.
- Voice errors thrown inside `onSpeechError` callbacks are silent. Always route them through `set({ error: ... })`.
- Before any TTS `speak()` call, strip markdown: remove backtick fences, `**bold**`, `# headings`. Speak plain prose only.
- `autoSendVoice` defaults to `true`. Any voice-triggered action that is destructive or irreversible must require explicit confirmation first.
- Locale is hardcoded to `en-US` in `voiceService.ts`. Don't change it without also adding a settings field for it.

---

## Working Rules

- Follow repository standards by default.
- Do not silently skip required docs or controls (`project-control.yaml` lists them).
- Record justified deviations as exceptions in `project-control.yaml`.
- When you add a feature, update `docs/CHANGELOG.md` and `docs/roadmap.md`.
- Reassess governance when risk, autonomy level, data sensitivity, or money movement changes.
- Never commit secrets. `scripts/governance-preflight.sh` runs a secret scan — read its output.

---

## After You Finish

Ask yourself: *did I introduce any new silent failure paths?* If yes, add explicit error handling before committing.
