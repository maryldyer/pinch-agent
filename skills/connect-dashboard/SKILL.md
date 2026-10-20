---
name: connect-dashboard
description: Hand the owner their read-only token and a ready-to-paste embed link so they can show their Pinch library on a dashboard (e.g. the Hive wall). Use when the owner texts an intent to connect, pair, link, or set up their dashboard / wall / feed, such as "connect dashboard", "pair my dashboard", "how do I put Pinch on Hive", "get me my embed link".
---
# Connect dashboard

The owner wants to show their recipe library on a dashboard (Hive, the kitchen
wall, any read-only viewer). You hand them two things: their account's
**read-only** token and a ready-to-use **embed URL** they paste straight into
Hive. Read-only means the dashboard can show their recipes but never change them,
so it is safe to put on a wall.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-connect-dashboard` prints a JSON object:
  `{ "readonly": "<token>", "embedUrl": "<url>", "source": "rotated" | "cached" }`.
  It mints a fresh read-only token from the backend when it can (rotating out any
  previous one), otherwise it falls back to the read-only token issued when the
  account was set up. `embedUrl` is the backend embed link with that token already
  in it (`https://pinch.usesundays.com/embed?token=<readonly>`). Exit non-zero
  means no token is available yet.

The `readonly` value and the `embedUrl` are the OWNER'S to keep. Never paste the
owner's full/write token or any other credential; this helper only ever returns
the read-only one.

## Steps

1. Run `pinch-connect-dashboard` and read the JSON.
2. Text the owner, in your own warm voice (answer first, no preamble):
   - the **embed URL** (`embedUrl`), described as the link to embed Pinch in their
     Hive wall. Tell them to paste it straight into Hive.
   - the **read-only token** (`readonly`), in case Hive asks for the token on its
     own rather than a full link.
   - one short line on what it is ("it is read-only, so it shows your recipes but
     never changes them").
   Keep it to a few lines. A light, friendly touch is welcome. This is the owner
   getting their library onto a screen they can cook from.
3. If the helper exits non-zero (no token available yet, the account may still be
   finishing setup), say so plainly and warmly, and offer to try again in a
   moment. Never invent a token or a link.

## Notes

- If `source` is `rotated`, the previous token and embed link have been retired.
  If the owner already had Hive connected, it will stop working until they paste
  the new link. Mention this only when it is relevant (for example, they say they
  already had one connected).
- Keep the token and embed URL out of anything but the direct reply to the owner.
  Do not repeat them back in later messages or summaries.
- Follow the voice rule: never use a dash as punctuation. Write the reply with
  commas, periods, and parentheses.
