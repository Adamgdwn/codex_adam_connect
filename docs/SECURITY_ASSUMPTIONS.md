# Security Assumptions

## Scope

This document defines assumptions and constraints for v1 of a single-owner remote development control platform.

## Core Principles

- Single-owner identity: one human operator controls all devices and approvals.
- Local-first execution: source code and command execution remain on local machines.
- Approval-first: privileged actions require explicit approval events.
- Least privilege: governed operations are restricted to trusted folders.
- Full auditability: all security-relevant actions produce append-only logs.

## Trust Boundaries

1. Mobile app
- Trusted for operator decisions (approval allow/deny).
- Not trusted for direct command execution.

2. VS Code extension
- Trusted for UX and intent capture.
- Not trusted as enforcement point for policy-critical checks.

3. Desktop companion
- Primary local trust anchor and policy enforcement point.
- Must validate trusted folder allowlist and approval decisions.
- Must gate future command execution.

4. Supabase control plane
- Trusted for identity, metadata, queueing, and event transport.
- Not used to store source code by default.

## Threat Model Assumptions (v1)

- Adversary may observe network traffic but TLS and auth protections are active.
- Adversary may attempt unauthorized privileged actions via extension or API.
- Adversary may attempt replay of stale approvals or session tokens.
- Adversary may attempt command execution outside trusted folders.

## Security Controls (Implemented/Planned)

- Row-level security for owner-scoped records in Supabase.
- Explicit statuses for approval requests with expiry and timestamps.
- Session lifecycle state machine representation with audit events.
- Trusted folder allowlist per device for policy enforcement.
- Unique event IDs/timestamps for replay detection in later phases.

## Non-Goals in v1

- Full hardware-backed device attestation.
- End-to-end encrypted payload channels for every event.
- Multi-user RBAC.
- Production-grade wake-on-LAN orchestration across all OS vendors.

## Required Hardening Work (TODO)

- TODO: Add signed device registration challenge/response.
- TODO: Add per-session scoped tokens with rotation.
- TODO: Add tamper-evident hash chaining for audit logs.
- TODO: Add secure secret storage abstraction (Keychain/DPAPI/Keystore).
- TODO: Add anti-replay nonce strategy for approvals.
