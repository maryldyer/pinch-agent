---
name: recipe-library
description: Search and read the owner's saved recipes over text — find recipes by keyword, recall a specific recipe's ingredients or steps, or report what was saved recently. Use when the owner asks about recipes they already have (not when they're sending a new one to save).
---
# Recipe library

Answer questions about recipes the owner has already saved. Read-only — this
skill never writes.

## Backend helpers (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`); they read `PINCH_BACKEND_URL` and
`PINCH_API_TOKEN` from the environment.

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

## Replying (SMS-appropriate)

- Keep it short. Answer the specific question — if they asked for one
  ingredient's amount, give that line, not the whole recipe.
- Use a list only for actual lists (ingredients, steps). For a full recipe,
  title + ingredients + numbered steps is enough; skip empty fields.
- Don't paste raw JSON or ids at the owner. Don't dump the whole library.
