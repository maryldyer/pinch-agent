---
name: meal-plan
description: Plan the owner's week of meals over text and turn the plan into a grocery list — assign a recipe to a day and meal ("plan shakshuka for Wednesday dinner"), answer what's planned ("what's for dinner?", "what's the week looking like"), clear a slot, and generate the shopping list from the week ("make the grocery list for this week"). Use for weekly meal planning and the plan→list hand-off.
---
# Meal plan

Keep a weekly plan — breakfast / lunch / dinner for each day — and turn it into a
consolidated grocery list on request. A plan is per-week (keyed by its Monday);
"this week" is the default. The backend owns consolidation (the single shared
engine); generate just points it at the week's assigned recipes.

## Backend helpers (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`); they read `PINCH_BACKEND_URL` and
`PINCH_API_TOKEN` from the environment.

- `pinch-search "<query>"` / `pinch-get <id>` — resolve a recipe the owner names
  to its id (see the recipe-library skill).
- `pinch-plan [--week YYYY-MM-DD] [--json]` — read the week's plan. Plain output
  is one line per entry: a recipe entry shows `<date> <slot>: <recipe title>`, and
  a free-text NOTE entry shows `<date> <slot>: note: <text>`. A slot can hold more
  than one entry (a recipe plus one or more notes), so you may see several lines for
  the same day and slot; they are all real. A never-planned week prints nothing.
  `--json` gives `{ plan, entries }`; each entry has `date`, `slot`, and either a
  `recipeId` or a `note`. An entry with no `recipeId` is a note, NOT an empty slot.
- `pinch-plan-set <date> <slot> <recipeId> [--week YYYY-MM-DD]` — assign a recipe
  to a `(date, slot)`. `date` is `YYYY-MM-DD`; `slot` is `breakfast|lunch|dinner`.
  Re-assigning a slot replaces what was there (one recipe per slot). The plan is
  created on the first assign.
- `pinch-plan-clear <date> <slot> [--week YYYY-MM-DD]` — empty a slot.
- `pinch-generate [--week YYYY-MM-DD] [--list <listId>]` — build the grocery list
  from the week's plan. Defaults to the `default` ("This Week") list. It REFRESHES
  the plan's contribution and PRESERVES anything hand-added or added ad-hoc from a
  recipe, so re-running it after a plan change is safe.

## Dates

The helpers take concrete dates. Turn the owner's words into a `YYYY-MM-DD` in
the CURRENT week unless they say otherwise: "Wednesday" → this week's Wednesday,
"tomorrow" → tomorrow's date, "next Monday" → that date (pass its week with
`--week` if it's a different week). If a day is ambiguous (already past this
week), ask which week they mean rather than guessing.

## Plan a meal ("plan shakshuka for Wednesday dinner")

1. Resolve the recipe (`pinch-search`; ask if several match).
2. Work out the date for the day they named (this week unless stated).
3. `pinch-plan-set <date> dinner <recipeId>`. Confirm in one line ("👍 Shakshuka
   for Wednesday dinner"). If they overwrite a slot that was filled, mention what
   it replaced.
- "Plan soup Monday and tacos Tuesday" → one `pinch-plan-set` per meal.
- A recipe can go in two slots on purpose (cooking it twice) — that's fine; the
  grocery list will count it twice.

## Answer what's planned ("what's for dinner?", "what's the week looking like")

- `pinch-plan` and answer the specific question. "What's for dinner [tonight]" →
  today's `dinner` line(s) (titles are already resolved in the output). "The week"
  → a short day-by-day rundown. If nothing's planned, say so and offer to help plan.
- Read EVERY entry, not just the ones with a recipe. A note entry (shown as
  `note: <text>`) is a real, planned item: surface its day, slot, and the note
  text. Never call a slot empty just because it has no recipe, and never skip or
  invent around a note. If a slot holds both a recipe and a note, mention both. A
  slot is only empty when `pinch-plan` prints no line for it at all.

## Hand off to the grocery list

After planning — or whenever they ask "make the grocery list for this week" —
offer and then run `pinch-generate`. Mention the staples assumption the same way
the grocery-list skill does (assume common pantry staples; tell them so they can
add any they're out of). Generate refreshes the plan items and leaves anything
they'd already hand-added on the list alone. Confirm with the list read back,
short. Then the grocery-list skill handles checking things off while they shop.

## Replying (SMS-appropriate)

- Short, answer first. A plan confirmation is one line; "what's the week" is a
  tidy list (day → meal), not a paragraph. Don't paste ids or raw JSON.

## Errors (never pretend)

- A helper exits non-zero (4 = unreachable, 5 = auth, 1 = other): tell the owner
  it didn't go through; only confirm after the helper succeeds.
- `pinch-plan-clear` exits 1 when the slot was already empty — just say there was
  nothing planned there.
