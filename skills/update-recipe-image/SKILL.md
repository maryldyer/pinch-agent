---
name: update-recipe-image
description: Set or change the photo on a recipe the owner already saved, from a photo they texted. Use when the owner sends a photo and says to use it for a recipe's image ("use this for the image", "use this photo", "set this as the picture for the carbonara", "here's a photo for that recipe"). Not for capturing a new recipe (that's capture-recipe); this only updates an existing recipe's image.
---
# Update recipe image

Attach a photo the owner texted to a recipe they've already saved, as its image.
The photo becomes the recipe's picture everywhere the library shows (the Pinch app
and any connected wall), because the backend stores it and sets the recipe's
`photoUrl`.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`); reads `PINCH_BACKEND_URL` and authenticates
with the account's cached FULL token (same plumbing as `pinch-save`).

- `pinch-set-image <recipeId> <imagePath>` — upload a local image file (a texted
  photo) as the recipe's picture. It converts a HEIC / oversize photo to a JPEG
  under 4MB for you, then POSTs it to `/api/pinch/recipes/:id/image`. On success it
  prints a one line confirmation; non-zero exit means it didn't go through (2 =
  usage/env, 4 = backend unreachable, 5 = auth, 1 = other, e.g. the recipe id is
  unknown).
- `pinch-set-image <recipeId> --url <imageUrl>` — if you already have a hosted
  image URL (not a texted file), hand the backend the URL to fetch and store.

## Steps

1. **Which recipe?** Figure out the one they mean:
   - the recipe you just captured or were just talking about (the one in the
     thread), or
   - one they name now ("the carbonara", "my kale salad") — resolve it with
     `pinch-search` and `pinch-get` (see the recipe-library skill). If several
     match, ask which, one short line.
   - If the photo is clearly for a BRAND NEW recipe (they're sending the dish, not
     pointing at a saved one), capture the recipe FIRST with capture-recipe, then
     set its image here using the new recipe's id.

2. **Find the photo.** Use the image they attached. Remember the two-message split
   works in BOTH directions: the photo often rides a different message from the
   instruction, just before or just after it. Look back across the last turn or two
   for the most recent attached image and use its file path. Never say the photo
   "didn't come through" or ask them to resend it.

3. **Set it.** Run `pinch-set-image <recipeId> <path-to-the-attached-photo>`. The
   helper handles the HEIC conversion and the 4MB limit.

4. **Confirm, briefly and in voice.** On success, one short warm line ("Done, that
   photo's on your carbonara now."). Vary it, no dashes. Don't narrate the
   conversion or the upload.

## Errors (be honest, never deflect)

- `pinch-set-image` exits non-zero: tell the owner plainly it didn't go through and
  offer to try again. Only confirm after it succeeds. Never claim you set the image
  when the helper failed.
- If you genuinely cannot find any attached photo even after looking back across the
  recent turns, handle it gracefully without announcing an absence or demanding a
  resend; it may still be arriving.
