# Wake Relay Deployment

## Purpose

The wake relay is the always-on low-power piece that can wake the main workstation without keeping the full homebase powered constantly.

Run it on a LAN-adjacent machine that stays on:

- Raspberry Pi
- NAS
- mini PC
- Linux box that already stays online

## Required Environment

Set these env vars on the machine that runs `apps/wake-relay`:

```env
WAKE_RELAY_TOKEN=replace-with-a-long-random-token
WAKE_RELAY_TARGETS_JSON=[{"id":"workstation-main","label":"Workstation Main","macAddress":"AA:BB:CC:DD:EE:FF","host":"192.168.1.25","pingPort":43111,"broadcastAddress":"192.168.1.255"}]
WAKE_RELAY_PORT=43112
WAKE_RELAY_HOST=0.0.0.0
```

Optional tuning:

- `WAKE_RELAY_TIMEOUT_MS`
- `WAKE_RELAY_POLL_INTERVAL_MS`
- `WAKE_RELAY_WOL_PORT`
- `WAKE_RELAY_BROADCAST_ADDRESS`

## Desktop Gateway Configuration

Set these env vars in the root desktop `.env` so the mobile app can cache the relay details:

```env
WAKE_RELAY_BASE_URL=http://your-relay.tailnet-name:43112
WAKE_RELAY_TOKEN=replace-with-the-same-token
WAKE_RELAY_TARGET_ID=workstation-main
WAKE_RELAY_TARGET_LABEL=Workstation Main
```

## Start Commands

From the repo root:

```bash
npm run dev:wake-relay
```

For a production-like run:

```bash
npm run build --workspace @adam-connect/wake-relay
npm run start --workspace @adam-connect/wake-relay
```

## Validation

1. Open `http://<relay-host>:43112/health` and confirm it returns `ok: true`.
2. Pair or refresh the phone against the desktop gateway.
3. Confirm `Host -> Wake Homebase` appears.
4. Put the workstation to sleep.
5. Tap `Wake Homebase` on the phone.
6. Confirm the workstation heartbeat returns and Adam Connect reconnects.

## Notes

- The relay token is wake-scoped. It is still sensitive and should stay in local env only.
- The relay is currently Linux-oriented because the fallback readiness check uses `ping`.
- If the relay can send packets but the workstation never wakes, first verify BIOS/UEFI wake-on-LAN support and the target MAC/broadcast settings.
