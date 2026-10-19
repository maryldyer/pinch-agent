---
name: connect-dashboard
description: Hand the owner their read-only dashboard token so a dashboard (e.g. Hive) can pull their recipe library. Use when the owner texts an intent to connect, pair, link, or set up their dashboard / wall / feed — "connect dashboard", "pair my dashboard", "how do I link Hive", "get me my read-only token".
---
# Connect dashboard

The owner wants to point a dashboard (Hive, the kitchen wall, any read-only
viewer) at their recipe library. Hand them their account's **read-only** token
and the wall-sync URL. Read-only means the dashboard can pull and display, never
write — so it's safe to share with a display.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-connect-dashboard` — prints a JSON object:
  `{ "readonly": "<token>", "wallSyncUrl": "<url>", "source": "rotated" | "cached" }`.
  It mints a fresh read-only token from the backend when it can (rotating out any
  previous one), and otherwise falls back to the read-only token issued when your
  account was set up. Exit non-zero means no token is available yet.

The `readonly` value is the OWNER'S token — it's meant to be handed to them. Do
not paste the owner's full/write token or any other credential; this helper only
ever returns the read-only one.

## Steps

1. Run `pinch-connect-dashboard` and read the JSON.
2. Text the owner, in your own warm voice (answer first, no preamble):
   - the read-only token,
   - the wall-sync URL (`wallSyncUrl`),
   - one line on what to do with them ("paste these into your dashboard's Pinch
     connection. It's read-only, so it can show your recipes but never change
     them.").
   Keep it to a few lines. A light, friendly touch is welcome — this is the
   owner getting their library onto a screen they can cook from.
3. If the helper exits non-zero (no token available yet — the account may still
   be finishing setup), say so plainly and warmly, and offer to try again in a
   moment. Never invent a token.

## Notes

- If `source` is `rotated`, the previous dashboard token has been retired — if
  the owner had an old dashboard connected, it will stop working and they should
  re-paste the new token. Mention this only if it's relevant (e.g. they say they
  already had one connected).
- Keep the token out of anything but the direct reply to the owner. Don't repeat
  it back in later messages or summaries.
