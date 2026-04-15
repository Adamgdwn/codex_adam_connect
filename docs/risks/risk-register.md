# Risk Register

## Current Risk Classification

- Tier: Medium
- Owner: Adam Goodwin
- Last reviewed: 2026-04-11

## Key Risks

| ID | Risk | Likelihood | Impact | Controls | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Remote phone control could target the wrong workspace | Medium | High | Session creation is limited to approved desktop roots | Owner | Open |
| R-002 | Codex login expires and the phone appears broken | Medium | Medium | Host heartbeat reports auth state and recovery command | Owner | Open |
| R-003 | Device token theft would allow remote access to the paired host | Low | High | Pairing is private-network only and mobile stores the token in device keychain | Owner | Open |
| R-004 | Experimental Codex app-server protocol changes could break the bridge | Medium | Medium | Keep Codex protocol details isolated inside the desktop bridge | Owner | Open |
| R-005 | Desktop-surface drift could confuse users if the supported Freedom shell and the browser fallback diverge | Medium | Medium | Keep the Electron shell as the supported day-to-day path and treat the browser page as install/recovery/admin fallback only | Owner | Open |
| R-006 | Wake-on-request could power on the wrong machine or expose remote power control too broadly | Medium | High | Use a wake-scoped relay token, explicit target IDs, and manual user-triggered wake only | Owner | Open |
| R-007 | Outbound email could leak sensitive content outside the trusted chat tunnel | Medium | High | Manual send only, trusted recipient list, gateway-local provider secrets, and audit logging for every external delivery | Owner | Open |

## Checkpoint Review

### Completed

- the supported desktop path is now clear: Freedom desktop shell first, browser fallback second
- Linux desktop launcher installation reduces day-to-day friction without changing the trust model

### Next

- reassess this register after another real-device companion pass confirms shell and browser fallback behavior
- keep the browser path narrow so it does not grow back into a competing primary surface
