# Phased Implementation Plan

## Phase 1: Scaffold + Contracts

- Establish monorepo and TypeScript workspace structure.
- Define shared contracts for devices, sessions, approvals, logs, provider connections, trusted folders, and wake capabilities.
- Scaffold mobile app, VS Code extension, desktop companion, control-plane helpers.
- Add Supabase schema proposals and baseline migrations.

## Phase 2: Auth + Device Registration

- Implement single-owner auth flows with Supabase Auth.
- Add profile bootstrap and owner profile validation.
- Implement desktop companion device registration handshake.
- Implement extension command: register this machine.
- Show registered devices in mobile app from realtime query.

## Phase 3: Trusted Folders + Local Policy

- Implement trusted folder CRUD in companion persistence.
- Implement extension command: choose trusted folders.
- Add policy checks for session start and privileged action requests.
- Synchronize trusted folder metadata with control plane.

## Phase 4: Session Orchestration

- Implement session state machine transitions in companion.
- Add extension commands: connect/disconnect, start session, pause/end session.
- Add session registry write-through to Supabase.
- Stream session lifecycle events to mobile app and extension state views.

## Phase 5: Approvals

- Implement approval request creation from extension/companion.
- Add mobile approval queue and resolve actions.
- Enforce approval decision in companion before privileged handoff.
- Audit all approval request/resolve events.

## Phase 6: Wake Feature

- Implement wake provider interface adapters (platform-specific).
- Add wake requested/result events and UI state.
- Add fallback capability reporting where wake is unavailable.
- Harden retry, timeout, and observability for wake flows.

## Phase 7: Provider Integrations

- Add provider connection records and token placeholders.
- Implement interface-based adapters for GitHub/Vercel/Supabase/Stripe metadata operations.
- Keep OAuth flows stubbed until explicit scope and security review.
- Add provider-specific audit events and permission boundaries.
