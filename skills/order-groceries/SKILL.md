---
name: order-groceries
description: Actually shop the owner's grocery list on Instacart via the browser (Latch) — open their already-logged-in Instacart session, add their items by clicking "Add" on their "Buy it again" products, and build the cart for them to check out. Use when the owner wants you to buy/order/shop their list ("order my groceries", "buy my groceries", "add my list to Instacart", "do my Instacart order", "shop my list"). This BUILDS the cart and stops; it never checks out or pays. It is NOT for building or editing the list itself (grocery-list skill) or for finding a product's aisle in a store you're standing in (grocery-finder skill).
---
# Order groceries (build the cart on Instacart)

The owner wants their Pinch grocery list actually bought. You drive their own
**logged-in Instacart session** with your browser tools (Latch) and build a cart,
leaning on their "Buy it again" so they get their real brands. You **build the
cart and stop** — you do NOT check out, pay, or place an order in this version.
That stays the owner's to do on their device.

Read this whole skill before you touch the browser. The single most important
thing here is **restraint**: a careful, light-touch pass that builds a cart beats
a frantic one that gets the session blocked. A previous attempt thrashed (dozens
of rapid clicks and searches) and tripped Instacart's bot detection, which locked
the session. Don't repeat that.

## Get the list first (no browser yet)

Read the owner's list with the grocery-list helpers on your PATH
(`/opt/plow/pinch-bin`), before you open any browser:

- `pinch-list-items default --json` — the owner's "This Week" list (the one they
  mean by "my list"). Each item has a name, a display total, and its source
  meals. Use `--json` so you have the clean item names to match against.

If the list is empty, say so and stop — there's nothing to order. If they named a
different list, resolve its id with `pinch-lists` first. Hold the item names in
mind; those are what you'll match against "Buy it again".

## 1. Open the logged-in session — do NOT force a login

Open Instacart in the browser. **Assume the owner is already logged in** — this is
a persistent session they signed into once in Latch, and it stays signed in.

- If you land in their storefront (you can see their account, their store, "Buy it
  again"), good — go to step 2.
- If you hit a **login wall / sign-in page / "logged out"**, **STOP**. Do NOT type
  a username, do NOT enter credentials, do NOT touch a 2FA code or a CAPTCHA, even
  though you may have vaulted credentials and general permission to sign in. For
  grocery ordering specifically, a fresh login attempt is exactly what bounced
  between login and storefront and tripped bot detection last time. Instead, tell
  the owner warmly that you need them to log into Instacart once in Latch, then ask
  you again. For example: "Looks like Instacart's logged out on my end. Pop into
  Latch and sign into Instacart once, then tell me to go again and I'll fill the
  cart." Then stop.

## 2. Add from "Buy it again" by clicking Add directly

Open the owner's **"Buy it again"** page (their previously-purchased products).
Pinch reads this reliably. For each item on the grocery list that matches a "Buy
it again" product (by product name / brand, use common sense — "milk" matches
their usual milk, "eggs" their usual eggs):

- Click that product's **"Add"** button **directly** on the Buy-it-again page.
- No search box, no autocomplete, no typing. The Add button is right there; that's
  the whole point of using Buy-it-again — it's the few-actions, low-risk path.

Work through the list once, top to bottom. Keep a running tally in your head of
what you added. Don't re-open or re-screenshot the page after every single click;
add what you can see, scroll once if you need more, and move on.

## 3. Items NOT in "Buy it again" — ONE deliberate search each

For a list item with no "Buy it again" match, do **exactly one** search:

- Search the item name once, look at the results, pick the top sensible match
  (organic only if the item name itself says organic), click its Add.
- **One search per item. No retries, no thrashing.** If the search is messy, the
  autocomplete misbehaves, or nothing sensible comes up, **skip it and note it** —
  do not search again, do not hammer the box. A skipped item is fine; a blocked
  session is not.

## 4. Be gentle — stop the moment anything pushes back

Instacart watches for bot-like behavior. Move like a careful person, not a script:

- Minimize redundant actions: no repeated screenshots, no re-navigating the same
  page, no rapid-fire clicks. One deliberate action, see the result, next.
- Pace yourself. A handful of Adds and a few searches is plenty of activity.
- **If a request gets refused, a verification / CAPTCHA / "are you a robot" wall
  appears, or the page starts rejecting your actions — STOP IMMEDIATELY.** Do not
  retry, do not reload, do not try to solve it. Note where you were and report
  cleanly (step 5). Hammering is exactly what got the session blocked before.

## 5. Stop at the built cart and report (hostess voice)

When you've gone through the list once, **stop at the built cart. Do NOT check
out, do NOT pay, do NOT place the order.** Tell the owner, in your normal warm,
brief voice (answer first, no dashes):

- what you **added** (the items now in the cart),
- what you **couldn't add** (not in Buy-it-again and no clean search match, or
  skipped) so they can grab those themselves,
- and that the cart's built and ready for them to review and check out on
  Instacart. The checkout is theirs; you don't place orders yet.

If you stopped early (login wall from step 1, or a block from step 4), say exactly
where you stopped and what's in the cart so far, so nothing is a mystery. Offer to
pick up again once they've sorted the login, if that's what happened.

Keep it tight. A couple of lines: here's what's in your cart, here's what I
couldn't find, go check out when you're ready.

## Notes

- **Build only, never buy.** This version stops at a built cart on purpose. You
  never check out, pay, confirm, or place an order, no matter how it's phrased.
  Checkout plus its safety gates come in a later version.
- The list source is the existing consolidated grocery list (grocery-list skill);
  you only read it here, you don't change it.
- Never print or repeat the owner's Instacart credentials or any token. You don't
  handle the login at all in this flow.
- Voice: no dashes as punctuation (commas, periods, parentheses). Answer first,
  then stop.
