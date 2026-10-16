---
name: recipe-library
description: Search and read the owner's saved recipe library over text — find recipes by keyword, recall a specific recipe's ingredients or steps, or report what was saved recently — and format a short, readable reply.
---
# Recipe library

**Status: stub — full implementation lands in Chunk 8. This file declares intent
only; it does not yet implement the logic.**

## Intent

Answer the owner's questions about recipes they've already saved: "find my
chicken recipes", "how do I make the carbonara", "what did I save last", "how
much garlic in the chili".

## Behavior (to implement in Chunk 8)

- Search: `GET {PINCH_BACKEND_URL}/api/pinch/recipes?q=…` with
  `Authorization: Bearer {PINCH_API_TOKEN}`.
- Read one: `GET {PINCH_BACKEND_URL}/api/pinch/recipes/:id`.
- Format a short, readable text reply — title plus the part they asked for
  (ingredients, a step, times). Use a list only for actual lists (ingredients,
  steps). Don't dump the whole recipe when they asked one thing.
- On no matches, say so plainly and offer to broaden the search; on several
  matches, show a short titled list and ask which one.

## Config

- `PINCH_BACKEND_URL` — backend base URL (env, baked default
  `https://pinch.maryandjake.us`).
- `PINCH_API_TOKEN` — bearer token (env/secret, injected at deploy; never baked).
