---
name: capture-recipe
description: Capture a recipe the owner sends — from a URL, pasted text, a photo, or a social post — into a structured recipe and save it to the Pinch backend, after checking for an existing duplicate. Use whenever the owner texts something that is (or links to) a recipe, or says "save this".
---
# Capture recipe

Turn what the owner sent into one structured recipe and upsert it to the Pinch
backend so it shows up in both this chat and their Pinch app (shared library).

## Backend helpers (call via your shell tool)

These are on your PATH (installed at `/opt/plow/pinch-bin`). They read
`PINCH_BACKEND_URL` and `PINCH_API_TOKEN` from the environment — you never pass
the token yourself.

- `pinch-fetch <url>` — fetch a page the owner linked (you have no web-fetch
  tool). Prints any JSON-LD blocks first, then the page text.
- `pinch-search "<query>"` — search the library (for the dedup check). Prints
  `id<TAB>title<TAB>sourceUrl` per match.
- `pinch-get <id>` — read one full recipe as JSON (used when updating).
- `pinch-save <file.json>` or `… | pinch-save -` — upsert one recipe. You supply
  only the fields you extracted; the helper fills the mechanical ones (`id`,
  `hash`, `createdAt`/`updatedAt`), defaults `categories` to `[]`, derives
  `ingredientLines`/`steps` from the text when you omit the arrays, and sets
  every nullable field you leave out to `null`. It prints the saved recipe.

## Steps

1. **Identify the input type and extract a recipe.**
   - **URL** (links arrive as plain text): `pinch-fetch <url>`. Prefer the
     JSON-LD `schema.org/Recipe` block (name, recipeIngredient, recipeInstructions,
     prepTime, cookTime, totalTime, recipeYield, image). If there's no JSON-LD,
     read the page text and extract.
   - **Social post**: `pinch-fetch` the post URL; extract from caption / visible
     text. If it's only a video with no written recipe, extract what you can and
     tell the owner that's all that was there.
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

4. **Save.** Write the JSON and run `pinch-save`. On success, confirm in one
   short line: `Saved — <title>` (optionally the ingredient count or source).

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
