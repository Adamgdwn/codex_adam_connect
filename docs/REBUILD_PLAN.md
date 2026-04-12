# Rebuild Plan

## Final Monorepo Tree

```text
apps/
  desktop-extension/
    src/
      extension/
      host/
      services/
  gateway/
    src/
  mobile/
    android/
    src/
      app/
      screens/
      services/
      store/
      components/
packages/
  shared/
    src/
      schemas/
      contracts/
  core/
    src/
      pairing/
      commands/
      security/
  provider-adapters/
    src/
```

## Package Responsibilities

- `apps/desktop-extension`: local authority boundary, approved roots, command validation, local execution, provider calls, VS Code status hooks.
- `apps/gateway`: authenticated coordination API, device/host registration, pairing, command envelopes, event persistence, result polling.
- `apps/mobile`: React Native Android companion for sign-in, pairing, command submission, lifecycle states, and history.
- `packages/shared`: shared schemas, DTOs, status enums, result envelopes, and validation helpers.
- `packages/core`: reusable business logic for pairing, path approval, command lifecycle, and event creation.
- `packages/provider-adapters`: provider interface plus a real OpenAI-backed summarizer adapter.

## Mobile App Structure

- `src/app`: app shell and navigation state
- `src/screens/SignIn`
- `src/screens/PairDevice`
- `src/screens/Home`
- `src/screens/ResultDetail`
- `src/screens/Settings`
- `src/services/auth`
- `src/services/api`
- `src/services/device`
- `src/services/pairing`
- `src/services/commands`
- `src/store`

## Host Structure

- `src/host/runtime.ts`: host runtime composition
- `src/host/commandExecutor.ts`: summarize_file execution path
- `src/host/approvedRoots.ts`: path normalization and allowlist enforcement
- `src/host/store.ts`: local host config persistence
- `src/services/gatewayClient.ts`: backend coordination
- `src/extension/extension.ts`: minimal VS Code integration

## Shared Contract Model

- `UserSession`: authenticated user identity
- `RegisteredMobileDevice`
- `RegisteredHost`
- `PairingRecord`
- `CommandEnvelope`
- `CommandEvent`
- `CommandResultEnvelope`
- `SummarizeFilePayload`
- `HostStatus`

All contracts are schema-validated with Zod and exported as inferred TypeScript types.

## Pairing Flow

1. User signs in on mobile and desktop using the same demo auth secret.
2. Gateway registers both identities.
3. Desktop creates a pairing code.
4. Mobile submits the pairing code.
5. Gateway persists the paired relationship.
6. Desktop polls for assigned commands only after pairing is active.

## Command Lifecycle Flow

1. Mobile submits `summarize_file`.
2. Gateway persists command in `submitted`.
3. Desktop polls gateway and marks it `received`.
4. Desktop validates user, device, host, schema, and approved roots.
5. Desktop reads the local file and calls the provider adapter.
6. Desktop pushes `executing` and then `completed` or `failed`.
7. Gateway persists events and result metadata.
8. Mobile polls command history and renders lifecycle/result state.

## TypeScript Build Strategy

- npm workspaces
- TypeScript project references
- root `tsc -b` build orchestration
- internal packages compile to `dist`
- dependents reference package outputs through standard workspace resolution

## Smoke Test Scenario

1. Install dependencies from a clean checkout.
2. Start the gateway.
3. Start the desktop host with one approved root and an OpenAI API key.
4. Pair the host using the generated code.
5. Submit `summarize_file` for a sample file within the approved root.
6. Verify the result and event history through the gateway demo endpoint.

## Explicit Deferred Items

- unrestricted shell execution
- autonomous agents
- multi-provider routing UI
- push notifications
- multi-user org support
- broad desktop automation
- billing and subscriptions
