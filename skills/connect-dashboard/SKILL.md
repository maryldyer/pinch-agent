---
name: connect-dashboard
description: Hand the owner a ready-to-paste embed link so they can show and use their Pinch library on a dashboard (e.g. the Hive wall). The link is read-write, so from the wall they can add groceries and edit lists, not just view. Use when the owner texts an intent to connect, pair, link, or set up their dashboard / wall / feed, such as "connect dashboard", "pair my dashboard", "how do I put Pinch on Hive", "get me my embed link".
---
# Connect dashboard

The owner wants to put their recipe library on a dashboard (Hive, the kitchen
wall, any viewer). You hand them a ready-to-use **embed URL** they paste straight
into Hive. The link is **read-write**, so from the wall they can add groceries
and edit their lists, not only view their recipes.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-connect-dashboard` prints a JSON object:
  `{ "embedUrl": "<url>", "token": "<token>", "source": "rotated" }`.
  It mints a fresh dashboard token from the backend (rotating out any previous
  one) and returns the embed link with that token already in it
  (`https://pinch.usesundays.com/embed?token=<token>`). Exit non-zero means no
  link is available right now (the backend was unreachable, or the account is
  still finishing setup). It never falls back to a view-only link.

The `embedUrl` and `token` are the OWNER'S to keep. Never paste the owner's
capture/write credentials or PLOW token; this helper only ever returns the
dashboard embed token.

## Steps

1. Run `pinch-connect-dashboard` and read the JSON.
2. Text the owner, in your own warm voice (answer first, no preamble):
   - the **embed URL** (`embedUrl`), described as the link to put Pinch on their
     Hive wall. Tell them to paste it straight into Hive.
   - the **token** (`token`), in case Hive asks for the token on its own rather
     than a full link.
   - one short line on what it does ("from the wall you can add groceries and
     tweak your lists, not just look at your recipes").
   Keep it to a few lines. A light, friendly touch is welcome. This is the owner
   getting their kitchen onto a screen they can actually cook and shop from.
3. If the helper exits non-zero (no link available yet, the account may still be
   finishing setup, or the backend had a hiccup), say so plainly and warmly, and
   offer to try again in a moment. Never invent a token or a link, and never hand
   over an old link as a stand-in.

## Notes

- `source` is `rotated`: a fresh link was minted and any previous dashboard link
  was retired. If the owner already had Hive connected, it will stop working until
  they paste the new link. Mention this only when it is relevant (for example,
  they say they already had one connected).
- Keep the token and embed URL out of anything but the direct reply to the owner.
  Do not repeat them back in later messages or summaries.
- Follow the voice rule: never use a dash as punctuation. Write the reply with
  commas, periods, and parentheses.
