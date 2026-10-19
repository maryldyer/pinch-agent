---
name: capture-recipe
description: Capture a recipe the owner sends — from a URL, pasted text, a photo, or a social post — into a structured recipe and save it to the Pinch backend, after checking for an existing duplicate. Use whenever the owner texts something that is (or links to) a recipe, or says "save this".
---
# Capture recipe

Turn what the owner sent into one structured recipe and upsert it to the Pinch
backend so it shows up in both this chat and their Pinch app (shared library).

## Backend helpers (call via your shell tool)

These are on your PATH (installed at `/opt/plow/pinch-bin`). They read
`PINCH_BACKEND_URL` from the environment and authenticate with your account's
cached write token (the legacy `PINCH_API_TOKEN` is only the fallback) — you
never pass the token yourself.

- `pinch-fetch <url>` — fetch a recipe page the owner linked (you have no
  web-fetch tool). Prints any JSON-LD blocks first, then the page text. It is
  paywall-robust: it tries a browser fetch, then a Googlebot crawler fetch, then
  print/AMP variants, then a reader/cache, and returns the fullest result — so a
  soft-paywalled page usually still yields the full `schema.org/Recipe`.
- `pinch-video <url>` — for a social VIDEO post (TikTok / Reel / Short / YouTube).
  Pulls the caption, full description, and pinned/top comments (recipes often
  live there), downloads the video, and samples ~10–15 frames to JPEG files.
  Prints the text plus a `FRAMES (N):` list of image paths and a
  `STATUS: downloaded | download blocked` line. No audio transcription.
- `pinch-react <chat_uid> <message_uid> <emoji> [add|remove]` — put an iMessage
  tapback on a message (reads `PLOW_API_BASE` + `PLOW_AGENT_TOKEN` from the env,
  not the Pinch ones). `add` replaces your prior reaction on that message, so
  👀 → ✅ is just a second `add`. Fail-soft: if it can't react it exits quietly.
  Pass the inbound message's uid, or `latest` to react to the newest inbound
  message in the chat.
- `pinch-search "<query>"` — search the library (for the dedup check). Prints
  `id<TAB>title<TAB>sourceUrl` per match.
- `pinch-get <id>` — read one full recipe as JSON (used when updating).
- `pinch-save <file.json>` or `… | pinch-save -` — upsert one recipe. You supply
  only the fields you extracted; the helper fills the mechanical ones (`id`,
  `hash`, `createdAt`/`updatedAt`), defaults `categories` to `[]`, derives
  `ingredientLines`/`steps` from the text when you omit the arrays, and sets
  every nullable field you leave out to `null`. It prints the saved recipe.

## Steps

0. **Acknowledge immediately with a 👀 tapback.** As soon as you see the owner
   sent something to capture (a recipe URL, a photo, a social/video post, pasted
   recipe text), react to THAT inbound message with 👀 so they know you're on it:
   `pinch-react <chat_uid> <message_uid> 👀`.
   - **Where the ids come from:** they're the current turn's inbound message. The
     chat uid is this conversation's id — the same id you'd use to reply here
     (Plow exposes it as the conversation / `nativeChannelId`). The message uid is
     the inbound message's own id (`messageId`). If you have the chat uid but not
     the exact message id, use `pinch-react <chat_uid> latest 👀` — it reacts to
     the newest inbound message in this chat.
   - This is cosmetic and fail-soft: if the reaction doesn't land, say nothing and
     carry on. Only do it for a capture; don't tapback ordinary chit-chat.

1. **Identify the input type and extract a recipe.**
   - **URL** (links arrive as plain text): `pinch-fetch <url>`. Prefer the
     JSON-LD `schema.org/Recipe` block (name, recipeIngredient, recipeInstructions,
     prepTime, cookTime, totalTime, recipeYield, image). If there's no JSON-LD,
     read the page text and extract.
   - **Social VIDEO post** (TikTok / Reel / Short / YouTube): run
     `pinch-video <url>`. Then **read the sampled frame images** it lists
     (`FRAMES (N):`) with your own vision — on-screen ingredient and step
     overlays — **and** the text it pulled (caption, description, pinned/top
     comments). Synthesize one recipe from both: the frames usually carry the
     quantities/steps, the text carries the title and any written recipe. Flag
     only genuine gaps — if the quantities truly never appear on-screen or in the
     text, ask the owner for just those, don't invent them.
     - If `STATUS: download blocked`, you still got the text — work from it, say
       plainly that the video itself couldn't be read, and ask the owner to paste
       the steps or send a screenshot for anything missing. Never pretend you saw
       frames you didn't.
   - **Other social / article post** (no video): `pinch-fetch` the URL and
     extract from the JSON-LD / caption / text.
   - **Pasted text**: normalize the text into the recipe shape yourself.
   - **Photo** (MMS attachment): read the image directly with your own vision —
     transcribe the title, ingredients, and steps. (Do not call `pinch-fetch`
     for a photo.)

2. **Shape the recipe.** Produce a JSON object with the semantic fields you
   found:
   `title` (required), `ingredients` (raw text, one item per line),
   `ingredientLines` (array; optional — derived from `ingredients` if omitted),
   `directions` (raw text, one step per line), `steps` (array; optional),
   `prepTime`, `cookTime`, `totalTime`, `servings`, `source` (site/author name),
   `sourceUrl`, `photoUrl`, `notes`, `categories` (array, else omitted → `[]`).
   Leave out anything you don't have — do **not** invent quantities, times, or a
   source. Don't set `id`/`hash`/`createdAt`/`updatedAt` — the helper does.

3. **Dedup before saving.** `pinch-search "<title>"`. A match is a likely
   duplicate if the `sourceUrl` is the same, or the title is clearly the same
   recipe. On a likely match, **ask the owner** whether to update it or skip —
   don't silently create a second copy.
   - To **update**: `pinch-get <id>` for the existing recipe, merge your changes
     into it (keep its `id` and `createdAt`), and `pinch-save` the merged object.
     Upsert replaces the whole recipe, so include the fields you want to keep.

4. **Save, then flip the tapback to ✅.** Write the JSON and run `pinch-save`.
   On success:
   - change your 👀 reaction on the inbound message to ✅:
     `pinch-react <chat_uid> <message_uid> ✅` (a second `add` replaces the 👀;
     use the same ids from step 0, or `latest`). Fail-soft — skip silently if it
     doesn't land.
   - AND send the text confirmation in one short line that begins with the word
     "Saved", an em-dash, then the recipe name: `Saved — <title>, <N> ingredients`
     (count or source optional). This leading `Saved —` is the one intentional
     dash; keep the rest of the line comma/period-light per your voice. Keep
     both the tapback and the text line: the tapback is the quick ack, the text
     line is the real confirmation.
   - If the save failed, do NOT flip to ✅; tell the owner plainly (per Errors).

## Errors (never drop the owner's input)

- **Ambiguous / unparseable** (no title, two recipes on one page, a photo you
  can't fully read): ask the single most useful clarifying question and end the
  turn — or save a clearly-flagged partial (put what's missing in `notes`).
  Never silently discard what they sent.
- **Paywalled / blocked URL** (`pinch-fetch` reports a non-200): tell the owner
  the page couldn't be loaded, and offer to save it if they paste the text.
- **Backend unreachable / auth failure** (`pinch-save` exits non-zero: 4 =
  unreachable, 5 = auth): tell the owner plainly that the save didn't go
  through, and keep their input so they can retry — don't claim it was saved.
  Only confirm a save after `pinch-save` prints the saved recipe.
