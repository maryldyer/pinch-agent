---
name: recipe-library
description: Search and read the owner's saved recipes over text — find recipes by keyword, recall a specific recipe's ingredients or steps, or report what was saved recently. Use when the owner asks about recipes they already have (not when they're sending a new one to save).
---
# Recipe library

Answer questions about recipes the owner has already saved. Read-only — this
skill never writes.

## Backend helpers (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`); they read `PINCH_BACKEND_URL` from the
environment and authenticate with your account's cached write token (the legacy
`PINCH_API_TOKEN` is only the fallback) — you never pass a token yourself.

- `pinch-search "<query>"` — matches title / ingredient / category (case-
  insensitive substring; blank query returns everything). Prints
  `id<TAB>title<TAB>sourceUrl` per match, and a count on stderr.
- `pinch-get <id>` — prints one full recipe as JSON.

## Steps

- **Find** ("find my chicken recipes", "what did I save last"): run
  `pinch-search "<keywords>"`. Reply with a short titled list. If there are many,
  show the closest handful and offer to narrow. If none, say so plainly and
  offer to broaden or check the spelling.
- **Recall one** ("how do I make the carbonara", "how much garlic in the
  chili"): `pinch-search` to find the recipe, then `pinch-get <id>` for the full
  detail, and answer the specific thing asked.
  - If the search returns several candidates, ask which one (short list) rather
    than guessing.
  - **Only hand back the whole recipe when they actually want to see it**, when
    they say show, open, pull up, send me, what's in, or how do I make it, or when
    they just name a recipe with nothing else carrying over from the thread. If a
    recipe name lands as a follow-up to a different question (a pairing, a swap,
    timing, what to serve with it), that earlier question is what they mean: answer
    THAT about this recipe, pulling its detail up quietly with `pinch-get`, instead
    of dumping ingredients and steps. When it's genuinely unclear, one short line
    ("the pairing, or the full recipe?") beats a wrong guess.

## Replying (SMS-appropriate)

- Keep it short. Answer the specific question — if they asked for one
  ingredient's amount, give that line, not the whole recipe.
- Use a list only for actual lists (ingredients, steps). For a full recipe,
  title + ingredients + numbered steps is enough; skip empty fields.
- Don't paste raw JSON or ids at the owner. Don't dump the whole library.
