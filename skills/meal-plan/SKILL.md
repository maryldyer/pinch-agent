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
- `pinch-today [--json]` — what's planned for the household's REAL "today", with
  the day resolved by the BACKEND in the household timezone (NOT UTC). The first
  line is `today: <YYYY-MM-DD>` — the correct local "today" (resolved in the
  owner's stored timezone); then one line
  per planned slot (`<slot>: <title>`, or `<slot>: note: <text>`). An empty day
  prints just the `today:` line. Use this for "what's for dinner / what's planned
  today", AND read its `today:` date as the anchor for every other date you work
  out (see Dates). `--json` gives `{ accountPublicId, date, meals }`.
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

Anchor "today" to the backend, NOT to the system-prompt "Current date". That
injected date renders in UTC, so in the evening Pacific it is already TOMORROW —
trusting it makes you read the wrong day (a slot that's often empty → a false
"nothing planned"). The real "today" is the `today:` line from `pinch-today`
(the household-local date). Run `pinch-today` whenever you need "today" or "this
week" and read its date as your anchor.

The helpers take concrete dates. Work every relative day off that local anchor
date (its week is "this week"): "today" → the anchor date, "tomorrow" → the day
after it, "Wednesday" → this week's Wednesday, "next Monday" → that date (pass
its week with `--week` if it's a different week). If a day is ambiguous (already
past this week), ask which week they mean rather than guessing. This keeps both
the nightly "what's for dinner" and the Sunday-night "this week" case correct.

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

- "What's for dinner [tonight]" / "what's planned today" → `pinch-today` (NOT
  `pinch-plan` with a self-picked day). Answer off its slot lines (titles are
  already resolved); "what's for dinner" is the `dinner:` line(s). The backend
  resolved the day in the household timezone, so this is right even late in the
  Pacific evening.
- "The week" / "what's the week looking like" → `pinch-plan` for the day-by-day
  rundown. Its default week is "this week"; confirm that matches the `pinch-today`
  anchor date's week, and read relative days off that anchor (see Dates).
- If nothing's planned, say so and offer to help plan.
- Read EVERY entry, not just the ones with a recipe. A note entry (shown as
  `note: <text>`) is a real, planned item: surface its day, slot, and the note
  text. Never call a slot empty just because it has no recipe, and never skip or
  invent around a note. If a slot holds both a recipe and a note, mention both. A
  slot is only empty when the helper prints no line for it at all.

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
