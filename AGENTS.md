# Agent Instructions — Adam Connect

Before substantial work:

1. Run:
   `bash scripts/governance-preflight.sh`
2. Review `project-control.yaml`.
3. Note affected controls, docs, tests, and exceptions.
4. If the change increases autonomy, destructive capability, sensitive-data exposure, or remote execution power, stop and call it out before proceeding.

## Mission

Improve Adam Connect as a phone-to-desktop coworker experience:
- remote updates
- starting new projects
- managing ideas remotely
- strong voice interaction
- clean readable chat
- named and persistent chats
- robust GUI on phone and desktop
- safe, resilient operation

## How to Think Before Editing

Do not patch symptoms blindly. Fix the root cause.

Before changing code, reason through:
1. What is the real root cause?
2. What user flow is affected?
3. What adjacent flows might fail for the same reason?
4. What is the simplest safe fix?
5. What small structural improvement would reduce repeat defects here?

## Required Adjacency Check

When changing one area, inspect connected areas before finishing.

- Pairing/auth → onboarding, token storage, invalid token, reconnect, disconnect
- Session logic → create, select, rename, delete, persistence, empty states
- Chat flow → send, receive, stop, stream updates, scroll, long-message rendering, error state
- Voice/TTS → permissions, mic start/stop, transcript handling, accidental send, TTS readability
- Desktop/gateway → startup, health checks, websocket reconnect, stale state, recovery messaging

## Product Priorities

Bias improvements toward these outcomes:

- The phone should feel like a natural remote operator console, not a thin terminal.
- Voice should be reliable, visible, and safe; avoid silent failures.
- Chats should be easy to name, resume, scan, and manage over time.
- The UI should favor clarity, low friction, and safe destructive actions.
- Desktop and phone should feel like one system with shared status and recovery behavior.

## Known Improvement Targets

Prefer fixing these when relevant:

- Break up oversized mixed-purpose files instead of extending them further.
- Improve chat readability: auto-scroll, better roles/labels, better long-message display, code-block handling.
- Improve session management: naming, rename/delete affordances, previews, timestamps, search, empty states.
- Improve voice flow: permission handling, visible listening state, transcript quality, confirmation for risky auto-send, TTS cleanup.
- Improve onboarding: less Tailscale confusion, guided steps, scan-based entry where useful.
- Improve resilience: visible error states, reconnect behavior, stale-state recovery, retry guidance.
- Improve polish where low risk: haptics, clearer feedback, better button safety, better grammar in surfaced text.

## Repo-Specific Notes

- `apps/mobile/src/store/appStore.ts` is the main mobile state coordinator; check side effects there first.
- `apps/mobile/src/app/AppShell.tsx` is a known decomposition target; do not keep growing the monolith if extraction is reasonable.
- Keep side effects in store/services, not scattered across UI components.
- Do not turn voice features into silent background behavior without explicit user control.
- Do not speak raw markdown or code formatting over TTS when plain-language output is possible.
- Realtime changes must be checked against websocket reconnect and stale session state.

## Implementation Rules

- Prefer root-cause fixes over UI-only masking.
- Prefer reducing complexity over adding more branching.
- Extract duplicated logic instead of copying another variation.
- Convert silent failures into visible user-facing errors or explicit logs.
- Preserve good existing behavior unless the task intentionally changes it.
- If a related defect is low-cost and clearly in scope, fix it in the same pass.
- If a related defect is high-risk or unclear, note it instead of freelancing.

## UX Quality Check

For user-facing changes, verify:
- loading state
- empty state
- error state
- retry path
- destructive action safety
- mobile usability
- naming and grammar clarity

## Done Standard

Before finishing:
1. Re-read the changed flow from the user’s perspective.
2. Check whether the fix introduced a new silent failure path.
3. Check whether adjacent flows still work.
4. Update docs/changelog if behavior changed.
5. Report:
   - root cause
   - fix made
   - adjacent checks performed
   - any follow-up issues found
