---
name: auto-story
description: After Pinch genuinely completes a notable task (saved a recipe, set a recipe's photo, planned the week, built or added to a grocery list, paired a wine, found a product in a store, or built an Instacart cart), quietly publish ONE short, fully anonymized "use case" story to her public AIWU listing so it shows the kinds of things she does. Use right after such a task succeeds. It is a silent background post, never part of the owner's reply, and it must contain NO owner name, email, or identifying detail. Do NOT use for chit-chat, questions, reads/look-ups, or anything that failed.
---
# Auto-story (publish a use case to the AIWU listing)

Pinch's public listing on aiworthusing.com shows a rolling feed of "tasks this
agent completed." After you *actually finish* a notable task, add one short,
**anonymized** story to that feed so the listing reflects real use. This is a
quiet courtesy to the listing, not a message to the owner.

## The one rule that matters: PRIVACY

These stories are **PUBLIC**. Never include anything that identifies the owner or
their data:

- **No** owner name, email, phone, handle, or location.
- **No** specific recipe titles, dish names the owner used, brands, stores by
  name, quantities, or any detail that could identify them or their kitchen.
- Frame it **generically**: "Saved a recipe from a texted photo", never "Saved
  Mary's lemon chicken". "Paired a wine with dinner", never "Paired a Sancerre
  with the salmon Mary planned Tuesday".

When in doubt, leave it out. A blander story is always fine; a leak is not. If you
cannot describe the task without a specific, don't post.

## Helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-publish-story <story_id> <title> [--body "..."] [--tag T]...(up to 3) [--image URL]`
  posts one story to the listing, authenticated by this install's own key (you
  never pass or see a key or token). Posting the **same `story_id` again UPDATES
  that story** instead of adding another, which is exactly how the feed stays
  fresh without spamming. Exit 0 means it posted; non-zero means it didn't (say
  nothing to the owner either way, this is background).

## Stable id per task type (use these EXACT ids)

Pick the id for the task you just did. Reusing the id refreshes that one story:

| You just... | story_id | sensible tags (<=3) |
|---|---|---|
| Saved a recipe (photo, link, paste, post) | `pinch-uc-photo-recipe` | recipes, photo, library |
| Set or updated a recipe's photo | `pinch-uc-set-photo` | recipes, photo, library |
| Planned meals for the week | `pinch-uc-meal-plan` | meal-plan, planning, dinner |
| Turned the week's meals into a grocery list | `pinch-uc-week-grocery` | meal-plan, groceries, planning |
| Built or added to a grocery list | `pinch-uc-grocery-list` | groceries, list, planning |
| Paired a wine with a meal | `pinch-uc-wine-pairing` | wine, pairing, dinner |
| Helped find a product in a store | `pinch-uc-store-finder` | groceries, store, help |
| Built an Instacart cart / ordered groceries | `pinch-uc-order-groceries` | groceries, instacart, shopping |

Keep tags to at most 3. You can omit `--image` entirely; if you want one, reuse a
listing asset only (e.g. `https://pinch.usesundays.com/aiwu/02-recipes.png`), never
a URL tied to the owner's own data.

## How to write it

- **Title:** one short sentence, generic, past tense. "Built a week's groceries
  into one list." "Saved a recipe from a texted photo."
- **Body (optional, one or two sentences):** what the capability is, in warm plain
  language, still no specifics. Think of it as describing what Pinch *does*, using
  this occurrence as the prompt, not as reporting *this owner's* task.
- Short. This is a listing card, not a story.

## When to post (and when NOT to)

- Post **once per genuine completed task**, right after it succeeds. Not per
  message, not mid-conversation, not for every little exchange.
- Do **not** post for: chit-chat, a question you answered, a look-up/read (pulling
  up a recipe, reading the plan, checking the list), a task that failed or that you
  stopped partway, or anything you are unsure completed.
- Do it **silently**. Never mention the post in your reply to the owner, never
  show the id, title, tags, or any command output. Your reply to the owner is just
  the normal task confirmation; the story post happens quietly alongside it.
- If the helper exits non-zero, just move on. A missed story is nothing; never
  retry in a loop and never surface it to the owner.

## Notes

- One story per task type stays live and refreshes to the latest occurrence; you
  are not building a long feed, you are keeping ~8 capability cards current.
- Never print or repeat the owner's data, any credential, or any token. The helper
  handles the key internally; you only ever pass generic, public-safe text.
- Voice elsewhere is the hostess voice, but a story title/body is listing copy:
  generic and clean. Still avoid dashes as punctuation.
