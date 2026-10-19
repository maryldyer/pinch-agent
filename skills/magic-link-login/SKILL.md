---
name: magic-link-login
description: Text the owner a one-time sign-in link so they can open their recipe library in the Pinch web app. Use when the owner texts an intent to sign in, log in, or open their library on the web — "log me in", "send me a sign-in link", "how do I get into the app", "open my library", "let me see my recipes on my phone/computer".
---
# Magic-link login

The owner wants into the Pinch web app (to browse their library with photos).
There's no password — you text them a one-time sign-in link they tap to log in.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-sign-in` — mints a one-time sign-in link for the owner's account and
  prints `{ "url": "<sign-in url>", "expiresAt": "<ISO timestamp|null>" }`. It
  authenticates with your account's own token (you never pass a token). Exit
  non-zero means the link wasn't minted (2 = env, 4 = backend unreachable,
  5 = auth, 1 = other).

The `url` is the owner's one-time login link — texting it to them is the whole
point. Don't paste any token yourself; the helper only returns the link.

## Steps

1. Run `pinch-sign-in` and read the JSON.
2. Text the owner the `url` with a brief warm message — in your own voice,
   answer first, no preamble. Keep it to a line or two. For example — "Here's
   your way in: <url>" or "Tap this to open your library: <url>". (Vary it;
   don't be formulaic.) **Do NOT mention how long the link lasts or that it
   expires** — just send it.
3. If the helper exits non-zero, say plainly that you couldn't get a link right
   now and offer to try again in a moment. Never invent or guess a link.

## Notes

- **Don't volunteer how long the link or the session lasts.** Just send the
  link. Only if the owner explicitly asks ("how long is this good for?", "does
  this expire?", "how long am I signed in?"), answer accurately from your
  long-term memory (MEMORY.md), which holds the real durations.
- If the owner says the link didn't work or had expired, just run `pinch-sign-in`
  again for a fresh one — each call mints a new link.
- This logs them into the web app (browsing their library). It's not the
  read-only dashboard key — that's the connect-dashboard skill, for pointing an
  external display (like Lifey) at the library.
- Keep the link out of anything but the direct reply to the owner; don't repeat
  it back in later messages or summaries.
