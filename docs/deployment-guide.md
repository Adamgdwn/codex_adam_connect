# Deployment Guide

## Environments

- `dev`: local workstation plus emulator or physical phone
- `staging`: optional second workstation or branch-local validation
- `prod`: the owner workstation that the phone pairs against

## Deployment Steps

1. run governance preflight
2. run `npm run typecheck`, `npm run build`, `npm run lint`, and `npm test`
3. verify `codex login status`
4. start the supported desktop surface with `npm run launch`
5. optional on Linux: install the desktop-menu launcher with `npm run app:desktop:install-launcher`
6. pair or reconnect the phone to that workstation URL

## Rollback

- stop the desktop stack
- or stop the `npm run launch` process if that is the active path
- switch back to the prior branch or build
- restart the desktop stack
- reconnect the phone if the pairing code changed

## Validation

- `npm run smoke`
- manual phone pairing against the real workstation
- live chat turn from an approved root

## Checkpoint Status

### Completed

- deployment now has a supported desktop GUI path instead of terminal-only startup
- Linux launcher installation is scripted for the supported dashboard flow

### Next

- package and validate a native shell only after runtime behavior is proven
- add a release-grade desktop distribution story if the browser-first path is not sufficient
