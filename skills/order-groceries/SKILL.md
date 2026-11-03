---
name: order-groceries
description: Actually shop the owner's grocery list on Instacart via the browser (Latch) — open their Instacart session (signing in with their email verification code if it's logged out), add their items by clicking "Add" on their "Buy it again" products, then review the cart and place the order. Use when the owner wants you to buy/order/shop their list ("order my groceries", "buy my groceries", "add my list to Instacart", "do my Instacart order", "shop my list"). This builds the cart AND checks out (places the order) when they ask; it spends only because they asked, never on its own. It is NOT for building or editing the list itself (grocery-list skill) or for finding a product's aisle in a store you're standing in (grocery-finder skill).
---
# Order groceries (build the cart and check out on Instacart)

The owner wants their Pinch grocery list actually bought. You drive their own
Instacart session with your browser tools (Latch), signing in for them if it's
logged out (step 1), build a cart that reflects **her saved brand/organic
preferences first** and leans on **"Buy it again" as the hint**, then **review
the cart and place the order** (step 4). You do this when the owner asks you to
order/buy/shop their list; you are spending on their behalf only because they
asked for this order, never on your own initiative.

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

## Read her preferences (and learn one or two) — still no browser

Pinch remembers how the owner likes her groceries (brand, organic, and a
price-vs-brand lean), keyed by **product form** (§4.2). Load that now so the cart
comes back the way she'd pick. Use `pinch-prefs` on your PATH:

- Key each list item by its product FORM and read the saved prefs:
  `pinch-prefs get --derive "<item name>" "<item name>" … --json` → the stored
  `{ preferences: [...] }` for the ones she's answered (each has `brand`,
  `organic`, `driverOverride`; keys she hasn't answered are simply absent).
  `--derive` keys each line the SAME way the gap-check does, so they agree.
- `pinch-prefs driver --json` → her **global** price-vs-brand lean
  (`{ driver: "price" | "brand" | null }`; null means balanced).

Hold these; step 2 applies them. The **store is the authority** — where she has a
saved pref, it wins; where she doesn't, "Buy it again" is just the hint.

Preferences are an **enhancement, never a gate.** If ANY `pinch-prefs` read
(`get`, `unknown`, or `driver`) fails for any reason — backend down, the endpoints
not deployed yet, a non-zero exit, a timeout — just proceed with the normal
Buy-it-again flow as if there were no saved prefs. Don't retry hard, don't error
out the order, don't mention it; a preferences lookup that can't answer degrades
silently to today's behavior.

**Order-time this-or-that (ask about at most TWO unknowns).** Ordering is exactly
the moment to fill a gap you don't know yet — follow the grocery-preferences skill:
`pinch-prefs unknown --derive --max 2 "<item>" …` returns at most two items she
has **no** saved pref for; ask a light either/or about just those ("San Marzano or
the store brand for the crushed tomatoes?"), and `pinch-prefs upsert` her answer
(`--source this_or_that`) so the cart uses it and you never re-ask. Keep it to the
drip rules there: only unknowns, ≤2, and skip it entirely if she's in a hurry —
never hold up her order for it. And if the `unknown` check itself errors or can't
reach the backend, skip the this-or-that silently and go straight to building the
cart — same graceful degradation as the reads above.

## 1. Open the session, and log in yourself if needed

Open Instacart in the browser. The browser is **headless** — the owner can't see
it or type into it, so there's no screen for them to log in on. If Instacart needs
a login, **you do the whole login yourself**. Don't ask the owner to sign in and
don't hand it off.

- If you land in their storefront (you can see their account, their store, "Buy it
  again"), you're already signed in — skip to step 2.
- If you hit a **sign-in page or an email-code prompt**, log in end to end:

  1. **Enter the owner's Instacart email** in the sign-in field and submit it.
  2. **Trigger the verification code** (Instacart emails a one-time code, or
     sometimes texts it). Note roughly when you asked for it; you want the code
     from *this* request, not an old one.
  3. **Get the code via the connectors, following the general "When the web asks
     for a code" rule in your main instructions.** For an EMAILED code, use the
     **plow-gog connector** (the owner's Gmail) to read the NEWEST Instacart
     verification email, the one that just arrived after you triggered it; if it
     has not landed yet, give it a moment and check again once. For a TEXTED code,
     use the **imessage connector**. Prefer these over opening webmail in the
     browser. Read ONLY the code, never anything else in their mail or messages,
     and never print or leak it.
  4. **Enter that code** back on the Instacart prompt to finish signing in.
  5. Once you're in the storefront, go to step 2 and build the cart.

- Keep the same gentle discipline through the login as everywhere else (see step 3):
  one deliberate action at a time, no rapid retries, no looping on the code box. If
  a **CAPTCHA, a "verify you're human" wall, or any wall you genuinely can't pass**
  appears, **STOP** and report cleanly — do not hammer it. Tell the owner you got
  stuck at the Instacart login and exactly where, so they know the cart wasn't
  built and nothing was ordered.

## 2. Build the cart — her preference first, Buy-it-again as the hint

Open the owner's **"Buy it again"** page (their previously-purchased products);
Pinch reads it reliably. Work the list once, top to bottom. For each item, apply
this decision — it's a short, fixed rule, not something to re-reason each time:

**First, the recipe's FORM is fixed and you never change it.** If the list says
*diced* tomatoes, you buy a diced product even if her saved tomato pref is "San
Marzano crushed". A preference only fills the **brand / organic** for the form the
list already calls for (§4.2). Her list item already carries the right form; keep
it.

Then, for that item:

1. **No saved pref for it?** The store had nothing to assert, so "Buy it again" is
   the hint: click **Add** directly on her usual Buy-it-again product (common
   sense — "milk" → her usual milk). No search, no typing. (If her global lean is
   `price` and there's an obviously cheaper equivalent, you may take that instead.)
2. **Saved pref with a brand, and that brand is right there as a one-click
   Buy-it-again product?** Add it directly. This is the cheap, low-risk path —
   prefer it.
3. **Saved brand, but NOT a one-click Buy-it-again option?** Do **exactly one**
   deliberate search for that brand+form. One search per item, no retries, no
   thrashing. If it surfaces, Add it.
   - **If that one search misses:** fall back to her Buy-it-again / a sensible
     generic for that item (or the cheapest if she has no Buy-it-again entry), Add
     it, and **note the swap** for your summary ("wanted San Marzano, added the
     store brand"). **Never search that item again.**
4. **Deal-breaker — her brand is available but a cheaper option diverges from it?**
   Resolve by her lean: the item's own `driverOverride` if set, else her global
   `driver` (from step "Read her preferences"):
   - `brand` → take her brand.
   - `price` → take the cheaper option, note the swap.
   - balanced (null) → take her brand **if** it's the cheap/Buy-it-again one,
     otherwise take the cheaper option and note the swap.
5. Honor **organic** as a filter on whichever product you pick (`yes` → the
   organic version, `no` → the non-organic; `no_preference` → don't care). It
   never changes the form.

Keep a running tally of what you added and what you swapped or skipped. Don't
re-open or re-screenshot after every click; add what you can see, scroll once if
you need more, move on.

**No order-level cap.** "One search per item" is per-item restraint, not a budget
on the whole order — never abandon the rest of the list to stay under some search
count; a half-placed order is useless. The only hard stop is Instacart's real
pushback (step 3). Leaning Buy-it-again-first is what keeps search volume, and
that bot-risk, low.

## 3. Be gentle — stop the moment anything pushes back

Instacart watches for bot-like behavior. Move like a careful person, not a script:

- Minimize redundant actions: no repeated screenshots, no re-navigating the same
  page, no rapid-fire clicks. One deliberate action, see the result, next.
- Pace yourself. A handful of Adds and a few searches is plenty of activity.
- **If a request gets refused, a verification / CAPTCHA / "are you a robot" wall
  appears, or the page starts rejecting your actions — STOP IMMEDIATELY.** Do not
  retry, do not reload, do not try to solve it. Note where you were and report
  cleanly (step 4). Hammering is exactly what got the session blocked before.

## 4. Review the cart, place the order, and report (hostess voice)

When you've gone through the list once, go to the cart and **review it** first:
confirm the items and quantities look right. Then proceed to checkout and **place
the order.** Checkout uses the owner's existing Instacart delivery address,
delivery/pickup slot, and saved payment method. If Instacart needs a required
checkout detail that isn't set (no saved payment method, no address, or it makes
you choose a delivery slot and none is clearly the owner's usual), **don't guess
and don't thrash:** stop at the reviewed cart, leave it ready, and tell the owner
exactly what checkout still needs so they can finish it. Keep the same gentle
discipline here as everywhere else: checkout is a couple of deliberate actions
(open cart, confirm, place), never a flurry.

Then tell the owner, in your normal warm, brief voice (answer first, no dashes):

- what you **ordered** (the items now placed),
- any **swaps** from a saved preference — where you used her Buy-it-again or a
  cheaper option instead of her preferred brand (her brand wasn't there, or her
  price lean chose the cheaper one), so there are no surprises,
- what you **couldn't add** (not in Buy-it-again and no clean search match, or
  skipped) so they can grab those themselves,
- and the confirmation in plain terms: that it's placed, plus the delivery or
  pickup window if Instacart showed one.

If you stopped early (a login wall from step 1, a block from step 3, or a missing
checkout detail above), say exactly where you stopped and what's in the cart so
far, so nothing is a mystery. Offer to pick up again once they've sorted it.

Keep it tight. A couple of lines: here's what I ordered, here's what I couldn't
find, and it's on its way (or: here's what Instacart still needs from you).

## 5. After it's placed: watch for delivery, then learn from it (phone turns only)

Once the order is **actually placed** (step 4 confirmed it — not a cart you left
for her to finish), set up a quiet watch so you can learn from how the order
turned out. The cleanest signal there is: the owner correcting a real delivery
("should've been the organic eggs"), which outranks Buy-it-again next time.

Do this ONLY when the order was placed from a **phone/iMessage** turn —
automations are phone-only (see "Reminders and scheduled work" in your main
instructions). If this order happened over email, skip the watch; don't promise it.

Schedule it with the **automations** tool, following the recipe in your main
instructions — an `every` ~30-minute `agentTurn`, `sessionTarget: "current"`,
delivery unset. Bake a **give-up deadline** into the job's prompt (about 3 days
out — delivery is usually same-day or next-day; past that, stop). The job's prompt
should tell its future self to:

1. **Check if it's past the deadline.** If now is past the baked-in ISO deadline,
   **remove this automation** (scoped self-remove) and do nothing else. This is the
   bounded give-up window — the poll never runs forever.
2. **Scan for the DELIVERY confirmation** — the Instacart *delivered* / *order
   delivered* notice (not the order-*placed* receipt from when you checked out).
   Look in the owner's Gmail via the **plow-gog connector** and their texts via the
   **imessage connector** (newest Instacart messages). Read only what's needed to
   tell whether it arrived; never print or leak anything.
3. **Not delivered yet?** Do nothing — stay silent, don't message her — and let
   the next firing (~30 min) check again. (No message on a non-event.)
4. **Delivered?** Send the owner the post-delivery check-in in your warm, brief
   voice: that it arrived, and **"anything you'd have changed?"** Then **remove
   this automation** (scoped self-remove) — the watch is done; her reply is a
   normal conversation from here.

**Capturing her corrections (the follow-up turn, no automation needed).** When she
answers the check-in with a change — "the organic eggs next time", "the store-brand
crushed tomatoes were fine", "get the cheaper pasta" — save each as a preference so
the next order is right:

- `pinch-prefs upsert --form-key "<her product phrase>" --derive --source post_delivery`
  with her brand (`--brand "…"` or `--no-brand`), organic (`--organic yes|no`),
  and a per-form lean if she implied one (`--driver price|brand`). `--derive` keys
  it through the SAME derivation as everything else, so it lands on the key
  order-time reads.
- `--source post_delivery` matters: these are explicit human corrections and the
  store ranks them **above** a this-or-that answer and above Buy-it-again — so they
  win at the next order with no extra work from you.
- This is the one clean learning signal (the human correcting a real outcome), so
  take it when offered; if she says "it was all perfect", great — nothing to save.

## Notes

- **Order when asked.** When the owner asks you to order/buy/shop their list, you
  build the cart and place the order (step 4). You spend on their behalf only
  because they asked for this order: never place an order they didn't ask for, and
  never on your own initiative. Checkout relies on the owner's Instacart account
  already having a saved payment method, a delivery address, and an available
  delivery/pickup slot; if one is missing, stop cleanly and tell them (step 4).
- The list source is the existing consolidated grocery list (grocery-list skill);
  you only read it here, you don't change it.
- You handle the login yourself when needed (step 1), but only ever read the
  owner's email to find the Instacart verification code, nothing else. Never print
  or repeat the owner's email, the verification code, any Instacart credential, or
  any token, not in the reply and not in a summary.
- **Post-delivery watch (step 5) is phone-only and self-limiting.** It uses the
  automations tool, which only exists on a phone/iMessage turn, and it always
  carries a give-up deadline and self-removes on delivery or at the deadline, so it
  can't linger. Don't offer it for an email-placed order. Read only enough of her
  mail/texts to tell the order arrived; the verification-code privacy rule applies
  the same way here.
- Voice: no dashes as punctuation (commas, periods, parentheses). Answer first,
  then stop.
