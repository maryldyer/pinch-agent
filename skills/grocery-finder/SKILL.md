---
name: grocery-finder
description: Help the owner find a specific product in a grocery store they're in right now, which aisle it's in, a backup spot, and what the common brand looks like. Use when they're at a store and can't find something or ask where a product is ("where's the tahini?", "what aisle is fish sauce in?", "I'm at Safeway and can't find miso"). Ask which store if they haven't said. NOT for building or managing a grocery list (that's the grocery-list skill); this only locates a product in a physical store.
---
# Grocery finder

The owner is standing in a store and can't find something. Tell them where to look,
fast. This is a HELP moment, so warm and clear, no snark, and brief: they're on
their feet with a cart.

This skill has no helpers and makes no calls. You answer from your own knowledge of
store layouts (see `references/store-layouts.md` for store-specific notes), and you
build one tappable image-search link so they can see what the package looks like.

## Steps

1. **Which store?** If they haven't said, ask once ("Which store are you in?") and
   wait. Common ones: Safeway, Nob Hill, Trader Joe's, Whole Foods, Target, Kroger,
   Ralph's, Vons, Sprouts, Publix, Wegmans, H-E-B.

2. **Where it is.** From standard layouts plus that store's conventions, give:
   - the most likely aisle,
   - a backup spot to check if it's not there,
   - a quick shelf tip (high/low, near what else).
   Keep the hedge honest: stores move things and not every store stocks everything.

3. **A picture to look for.** You cannot send a photo (you have no way to attach an
   image), so give a TAPPABLE Google Images search link for the likely brand. They
   tap it to see the package. Build it as:
   `https://www.google.com/search?q=<Brand+Product+grocery>&tbm=isch`
   (URL-encode the spaces as `+`). Name the brand in words too, so the link is a
   bonus, not the whole answer.

4. **Say it tight, in voice.** A few short lines they can read at a glance. Lead
   with the aisle. Example shape (vary it, never a dash):

   > Tahini at Trader Joe's: look in the spreads aisle by the peanut butter. If it's
   > not there, check the international shelf. It's usually their own label, tan jar,
   > low shelf. Here's what it looks like: <image search link>

## Notes

- If it's a specialty item the store may not carry, say so kindly and suggest a
  store nearby that's a safer bet, rather than sending them hunting.
- Trader Joe's leads with its own brand for most things, say that.
- Whole Foods: check the main aisle AND the specialty or bulk section.
- Nob Hill is a Raley's banner store, close to Safeway's layout.
- This is finding a product in the aisle. If they actually want to build or add to a
  shopping list, that's the grocery-list skill.
