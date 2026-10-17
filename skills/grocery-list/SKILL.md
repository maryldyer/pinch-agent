---
name: grocery-list
description: Build and manage the owner's grocery lists over text — turn one or more recipes (links or names) into a consolidated shopping list, add a single recipe's ingredients or a hand-added item, check things off while shopping, and clear a finished list. Use when the owner wants a shopping list ("make me a grocery list for X, Y and Z", "add the rest of the carbonara to my list", "what do I need for tonight", "I got the eggs", "clear my list").
---
# Grocery list

Turn recipes into one consolidated, trustworthy shopping list, and keep it up to
date while the owner shops. The backend does ALL the consolidation (the single
shared engine): you send ingredient lines, it merges by ingredient, sums the
totals, assigns aisles, and remembers which meal each item is for. You never add
up quantities yourself.

## Backend helpers (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`); they read `PINCH_BACKEND_URL` and
`PINCH_API_TOKEN` from the environment.

- `pinch-search "<query>"` / `pinch-get <id>` — find and read saved recipes (see
  the recipe-library skill). Use these to resolve a recipe the owner names.
- `pinch-lists` — show the owner's lists (`id<TAB>name`). `--create "<name>"`
  makes a new one and prints its JSON; `--rename <id> "<name>"`, `--delete <id>`.
  Every account has a default list, id **`default`** ("This Week") — the one the
  owner means by "my list".
- `pinch-list-items <listId> [--json]` — read a list. Plain output is one line
  per item (`[ ]`/`[x]` + the display total + its source meals); `--json` gives
  ids + sources for a follow-up check/clear.
- `pinch-add-recipe <listId> --id <recipeId>` — add a SAVED recipe's whole
  ingredient list. To add only SOME lines (e.g. leaving staples off — see below),
  pipe a recipe JSON on stdin instead: `echo '{"id":"…","title":"…",
  "ingredientLines":["…"]}' | pinch-add-recipe <listId>`. The server consolidates
  into the list (origin `recipe`); adding the same recipe twice sums, never
  duplicates.
- `pinch-add-item "<text>" [--list <listId>] [--aisle "<aisle>"]` — one hand-added
  item. The list defaults to `default` ("This Week" — "my list").
- `pinch-check <listId> <itemId> [--uncheck]` — tick an item off while shopping.
- `pinch-clear-checked [<listId>]` — remove everything already ticked off.
- `pinch-clear-list [<listId>]` — empty a list (keeps the list itself).

## Build a list ("make me a grocery list for X, Y and Z")

1. **Resolve each recipe.** For a name, `pinch-search` the library (if several
   match, ask which). For a link the owner sent, capture it first (the
   capture-recipe skill → `pinch-save`), then you have its id. For something not
   worth saving, you can still build an ad-hoc recipe object yourself.
2. **Apply the staples assumption, conversationally (§7).** Use your judgment:
   assume the owner already has common pantry staples — salt, pepper, cooking
   oils, common dried spices, water — and leave those off the list. **Say so** in
   your proposal ("assuming you've got salt, pepper and olive oil") so they can
   tell you if they're actually out of any. Don't keep a hard-coded staples list;
   this is a judgment call the owner always gets to correct.
3. **Propose before committing.** Tell them the consolidated list you're about to
   build — the meals it covers and the staples you're skipping — and let them
   trim or add. No checkboxes over text; they just reply.
4. **Commit.** For each recipe, add its (staple-trimmed) ingredients to the target
   list. Pipe the trimmed `ingredientLines` on stdin when you dropped staples;
   use `--id` to add everything. The server consolidates across all the recipes —
   overlapping ingredients merge and their totals sum (e.g. onion in two recipes
   becomes one line, and the item remembers both meals). Default target is the
   `default` ("This Week") list unless they ask for a separate one (then
   `pinch-lists --create` and add to that id).
5. **Confirm** with the final list read back (`pinch-list-items`), short.

## Lighter cases

- **"Add the rest of the carbonara to my list" / "what do I need for tonight":**
  one recipe. Resolve it, apply the staples assumption (tell them), and either
  add it to `default` or — if they're just asking what's needed — read its
  ingredients out without committing. "Pull up the ingredients for tonight" is a
  read; "add the rest" is an add.
- **Shopping ("I got the eggs", "got everything but the milk"):** read the list
  with `--json`, find the item id(s), `pinch-check` them off. "Clear what I've
  got" → `pinch-clear-checked`. "Start my list over" → `pinch-clear-list`.
- **A hand-added thing ("add paper towels"):** `pinch-add-item`.

## Replying (SMS-appropriate)

- Keep it short; lead with the answer. When you propose or confirm a list, group
  by aisle only if it's long; otherwise a tidy few lines is enough.
- Show the item line the way the owner reads it (total + name) and, when it helps
  trust, which meals an item is for ("onion ×2 — shakshuka and the soup"). Never
  paste ids or raw JSON at the owner.
- Name the staples you assumed, once, so the list stays trustworthy.

## Errors (never pretend)

- A helper exits non-zero (4 = backend unreachable, 5 = auth, 1 = other / not
  found): tell the owner plainly it didn't go through and keep their request.
  Only confirm an add/generate after the helper prints the updated list.
- Adding to a list that doesn't exist 404s — create it (`pinch-lists --create`)
  or use `default`, then retry.
