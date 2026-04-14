# Outbound Email Setup

## Recommended Sender Path

Use Resend for outbound delivery and keep Google mailbox credentials out of Adam Connect.

For `freedom@agoperations.ca`, verify `agoperations.ca` in Resend, then send from:

```env
OUTBOUND_EMAIL_FROM=freedom@agoperations.ca
OUTBOUND_EMAIL_REPLY_TO=freedom@agoperations.ca
```

## Desktop `.env`

Put these values in the root `.env` on the desktop that runs the gateway:

```env
OUTBOUND_EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxx
OUTBOUND_EMAIL_FROM=freedom@agoperations.ca
OUTBOUND_EMAIL_REPLY_TO=freedom@agoperations.ca
```

Do not put a Google mailbox password in the repo or in Adam Connect config.

## Resend Setup

1. Create a Resend account.
2. Add `agoperations.ca` as a verified domain.
3. Complete the DNS verification steps in Resend.
4. Create a Resend API key.
5. Put that API key into the desktop `.env`.

## Mobile Flow

1. Refresh the phone against the desktop.
2. Open `Host -> External Reports`.
3. Add one or more trusted recipient email addresses.
4. In chat, open a completed assistant reply.
5. Tap `Email this reply`, or ask for the email naturally in voice and confirm when Adam Connect prepares the draft.
6. Choose the recipient, edit subject/intro, and send.

## Validation

1. Confirm `Host -> External Reports` says email delivery is ready from `freedom@agoperations.ca`.
2. Add a trusted recipient.
3. Send a completed assistant reply externally.
4. Confirm the email arrives and `Activity` shows an external delivery audit entry.

## Notes

- The default send path reuses existing assistant output and does not call the model again.
- Trusted recipients are managed inside the gateway state and only visible to paired devices for that host.
- If delivery fails, check `RESEND_API_KEY`, domain verification, and the sender address first.
