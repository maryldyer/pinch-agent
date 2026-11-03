---
name: grocery-preferences
description: Learn the owner's grocery brand/organic preferences with a light, contextual this-or-that, and remember them so you never re-ask. Use when the owner engages about a meal — checks what's for dinner / this week, builds or adds to a grocery list, or asks you to order — to quietly fill in one or two UNKNOWN product preferences ("San Marzano or the store brand for the crushed tomatoes?", "organic eggs or regular?") and save the answer. This fills the preference memory that order-groceries later applies; it is NOT the ordering itself (order-groceries) or list building (grocery-list).
---
# Grocery preferences (the light this-or-that)

The owner shouldn't have to spell out every product every time. When she engages
about a meal, you quietly learn **one or two** of her brand / organic preferences
for that meal's ingredients and remember them, so the next order comes back the
way she'd pick without her micromanaging it. Two rules make this feel light
instead of a survey: **only ever ask about things you don't already know**, and
**at most two per interaction** (often zero — don't force it).

This skill only LEARNS and REMEMBERS. Applying the saved preferences when you
actually place an order is the order-groceries skill.

## Backend helper (call via your shell tool)

`pinch-prefs` is on your PATH (`/opt/plow/pinch-bin`); it reads `PINCH_BACKEND_URL`
and `PINCH_API_TOKEN` from the environment like the other helpers.

- `pinch-prefs derive "<ingredient line>" [...]` — print the stable **form_key**
  for each line (one per line). Pure/local, no network. This is the ONE correct
  way to key an ingredient — use it so your keys match what's stored (see Keying).
- `pinch-prefs unknown --derive --max 2 "<line>" [...]` — of those ingredient
  lines, print only the ones with **no saved preference yet** (at most 2). These
  are the only things you may ask about. If it prints nothing, don't ask — you
  already know (or there's nothing worth asking). `--json` for `{ unknown: [...] }`.
  (Pass already-derived form_keys and drop `--derive` if you keyed them yourself.)
- `pinch-prefs upsert --form-key "<key>" --source this_or_that [--brand "<brand>"]
  [--organic yes|no|no_preference] [--driver price|brand]` — save her answer for
  one form_key. Use `--no-brand` if she has no brand preference. `--source` is
  `this_or_that` here (the post-delivery check-in uses `post_delivery`).
- `pinch-prefs driver` — read her **global** price-vs-brand lean (`price`,
  `brand`, or balanced when unset). `pinch-prefs set-driver <price|brand|clear>` —
  set it (or `clear` back to balanced). This is the account-wide deal-breaker
  default (§4.4.5), separate from the per-form `--driver` override above.

## Keying — per product FORM (§4.2)

A preference attaches to a **product form**, not a category and not a brand. Key
every ingredient with `pinch-prefs derive` so the gap-check and the later order
agree. The rule it encodes:

- **KEEP the form word** — crushed / diced / paste / ground / whole / fresh /
  minced / … — it's what makes the product distinct. "crushed tomatoes" and
  "diced tomatoes" are **different** keys and must never be merged.
- **STRIP the brand** ("San Marzano"), **organic / preference** words ("organic",
  "free-range"), and **quantities / units** ("2 cups", "1 can").
- **"canned" drops when a form word is present** — "crushed (canned) tomatoes"
  keys on `crushed tomato`; the form word carries the canned-vs-fresh distinction.
  ("fresh tomatoes" is its own form.)

So "San Marzano crushed canned tomatoes", "2 (28 oz) cans crushed tomatoes", and
"crushed tomatoes" are all the **same** key (`crushed tomato`); `diced tomato`,
`tomato paste`, and `fresh tomato` are each **different**. A learned pref for
`crushed tomato` applies to any recipe that calls for crushed tomatoes, and never
bleeds onto diced, paste, or fresh. `pinch-prefs derive` knows the common brands;
if you recognize a brand it doesn't, drop it yourself before keying — you have the
recipe context, so you're the final authority on what the plain product is.

**The recipe is authoritative on the form.** A saved preference only supplies the
BRAND / ORGANIC for the form the recipe needs — it never changes the form. If the
salsa calls for *diced*, it gets diced even if her learned tomato pref is "San
Marzano crushed".

## The flow (when she engages about a meal)

1. You have the meal's ingredient lines (from the recipe, the plan, or the list
   you're building). Take the ones where brand/organic actually matters — pantry
   staples and proteins (tomatoes, pasta, eggs, chicken, olive oil, cheese), not
   water or "salt to taste".
2. `pinch-prefs unknown --derive --max 2 "<line>" "<line>" …` — this returns at
   most two form_keys she hasn't answered for. **These are the only ones you may
   ask about.** Everything else she's already told you — don't re-ask it.
3. If it returned nothing, ask nothing — just continue with what she wanted.
4. Otherwise ask a light, natural this-or-that, **anchored to this meal**, about
   those one or two — a real either/or, not an interview:
   - "San Marzano or the store brand for the crushed tomatoes?"
   - "Organic eggs, or regular?"
   Keep it to one quick question (two options). Never stack more than two keys,
   never turn it into a checklist, and don't ask if the moment's wrong (she's in a
   hurry, mid-order, frustrated) — it can wait for the next meal.
5. Save each answer with `pinch-prefs upsert` for that form_key: her brand
   (`--brand "San Marzano"` or `--no-brand`), organic (`--organic yes|no`), and a
   per-form price-vs-brand lean only if she says one ("whatever's cheapest" →
   `--driver price`; "always the good one" → `--driver brand`). `--source
   this_or_that`. Once saved, you never ask that one again.

## The global price-vs-brand lean (ask ONCE, only if unset)

Besides per-product brands, there's one account-wide default worth knowing: when
her preferred brand costs more than a store/alternative, does she generally stick
with her brand or grab the cheaper one? That's the global lean (§4.4.5) — the
deal-breaker Pinch falls back to at order time when a product has no per-form call
of its own.

Learn it the same gap-aware, one-time way you learn per-form prefs:

1. First read what's stored: `pinch-prefs driver`. If it already says `price` or
   `brand`, you **know it — never ask again.** Only when it's unset (balanced) is
   it open to ask.
2. When it's unset and the moment is natural (she's engaged about groceries, not
   rushed), ask ONE light this-or-that: "Generally, when the brand you like is
   pricier than a store or alternative, do you stick with your brand or grab the
   cheaper one?" Then save it: `pinch-prefs set-driver brand` (sticks with the
   brand) or `pinch-prefs set-driver price` (takes the cheaper one).
3. Once it's set, it's set — don't raise it again. It's a single lifetime question,
   not a per-meal one; fold it in at most once, and never ahead of what she
   actually asked for. If she shrugs it off, leave it unset and just move on (you
   can offer again another day, but don't push).

## Tone

This is drip, not a form. Most meals you'll ask nothing. When you do, it's one
friendly either/or in the flow of helping with dinner — the kind of thing a person
who shops for her would naturally check once and then just remember. If she waves
it off ("doesn't matter"), save that too (`--no-brand`, `--organic no_preference`)
so you don't ask again.

## If a preferences call fails

Every `pinch-prefs` read or write here is an **enhancement, never a gate**. If any
of them errors for any reason — backend down, endpoints not deployed yet, a
non-zero exit, a timeout — skip that ask or save **silently** and carry on with
whatever she actually asked for. Never retry hard, never block, never surface it
to her. Their absence just means you learn nothing this turn, same as today.
