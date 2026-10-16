---
name: capture-recipe
description: Capture a recipe the owner sends — from a URL, pasted text, a photo, or a social post — normalize it into the backend's Recipe shape, dedupe, and upsert it to the Pinch backend, then confirm what was saved.
---
# Capture recipe

**Status: stub — full implementation lands in Chunk 7. This file declares intent
only; it does not yet implement the logic.**

## Intent

When the owner sends something that looks like a recipe, turn it into a
structured `Recipe` and save it to the Pinch backend so it appears in both the
texting agent and the web app (shared library).

Handles four input types:
- **URL** — links arrive as plain text and the base image has no web-fetch tool,
  so this skill brings its own fetch, then extracts (prefer JSON-LD / schema.org
  `Recipe`, fall back to reading the page with the LLM).
- **Pasted text** — normalize prose into the recipe shape.
- **Photo** — read/OCR the image with the agent's multimodal model (requires the
  image-capable primary model the variant sets).
- **Social post** — best-effort from caption / visible text; if it's only a
  video with no written recipe, extract what's there and confirm with the owner.

## Behavior (to implement in Chunk 7)

- Produce fields matching the backend `Recipe`: `title`, `ingredients` /
  `ingredientLines`, `directions` / `steps`, prep/cook/total times, `servings`,
  `source`, `sourceUrl`, `categories`.
- Agent-authored recipes have no Paprika origin: generate a fresh UUID `id` and
  compute the required non-null content `hash`; set `createdAt` / `updatedAt`.
  Nullable fields may be null; `categories` defaults to `[]`.
- **Dedup:** exact match on `sourceUrl` when present; otherwise fuzzy title
  match. On a match, offer update vs. skip. (Known limit: pasted-text and photo
  captures have no `sourceUrl`, so they fall back to title-only matching.)
- Call `POST {PINCH_BACKEND_URL}/api/pinch/recipes` with
  `Authorization: Bearer {PINCH_API_TOKEN}`. Confirm the save in one short line.
- On an ambiguous or unparseable input, ask one clarifying question or save a
  partial flagged recipe — never silently drop the input.

## Config

- `PINCH_BACKEND_URL` — backend base URL (env, baked default
  `https://pinch.maryandjake.us`).
- `PINCH_API_TOKEN` — bearer token (env/secret, injected at deploy; never baked).
