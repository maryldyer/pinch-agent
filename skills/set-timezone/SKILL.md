---
name: set-timezone
description: Set or read the owner's timezone so "tonight" and the meal plan land on the right day. Use when the owner tells you where they are or asks about their timezone — "I'm in New York", "set my timezone to Eastern", "I moved to Chicago", "I'm on the west coast now", "what timezone am I set to", "change my time zone". Maps their words to the correct IANA zone and saves it.
---
# Set timezone

The owner's timezone decides which day "tonight" is. The backend resolves the
household's "today" (what's for dinner, the Cook-Tonight tile) from the stored
account timezone, so if it's wrong, the plan can show the wrong day. This skill
sets that zone, or reads it back, from the owner's own words.

## Backend helper (call via your shell tool)

On your PATH (`/opt/plow/pinch-bin`):

- `pinch-set-timezone <IANA zone>` — SET the zone (e.g.
  `pinch-set-timezone America/New_York`). Prints `timezone: <zone>` on success.
- `pinch-set-timezone` (no argument) — READ the current zone. Prints
  `timezone: <zone>` or `timezone: (not set, using the default)`.

Exit codes: `3` = the zone was rejected as invalid (ask the owner for their
city and try again), `4` = backend unreachable, `5` = auth, `2` = bad usage,
`1` = other. Only confirm after the helper succeeds.

## Map the owner's words to an IANA zone

The helper needs an IANA name. Turn what the owner says into one:

- "Eastern" / "east coast" / "New York" / "Boston" / "Miami" → `America/New_York`
- "Central" / "Chicago" / "Texas" / "Dallas" → `America/Chicago`
- "Mountain" / "Denver" / "Colorado" → `America/Denver`
- "Pacific" / "west coast" / "California" / "LA" / "Seattle" → `America/Los_Angeles`
- "Arizona" / "Phoenix" → `America/Phoenix` (Arizona does not do daylight saving)
- "Alaska" / "Anchorage" → `America/Anchorage`
- "Hawaii" / "Honolulu" → `Pacific/Honolulu`
- Another city or country: use the standard IANA zone for that place
  (London → `Europe/London`, Toronto → `America/Toronto`, and so on).

If you genuinely cannot tell which zone they mean (a region that spans several,
or a place you are unsure of), ask for the nearest big city rather than guessing.

## Set the zone ("I moved to Chicago", "set my timezone to Eastern")

1. Map their words to the IANA zone.
2. `pinch-set-timezone <zone>`.
3. Confirm in one warm line, naming the place in human terms, not the raw IANA
   string. For example: "Done, you're on Central time now. Tonight's dinner will
   line up with your clock." or "Set to Eastern. I'll plan your days around New
   York time."
4. If the helper exits `3` (zone rejected), don't retry the same value. Ask for
   their city warmly ("Which city are you closest to? I'll set it exactly."),
   map that, and try once more.

## Read the zone ("what timezone am I set to")

- `pinch-set-timezone` with no argument, then report it in plain terms ("You're
  set to Pacific time right now."). If it comes back not set, say you're using
  the house default (Pacific) and offer to set theirs if they tell you where they
  are.

## Replying (SMS-appropriate)

- Short, answer first, in the hostess voice. One line is plenty for a confirm.
  Say the place in human terms (Eastern, Central, New York time), not the IANA
  code. Never use a dash as punctuation: write with commas, periods, and
  parentheses.

## Related

- Once the zone is set, the meal-plan skill's `pinch-today` picks it up
  automatically (it asks the backend for "today" with no override), so
  "what's for dinner" resolves on the owner's real day.
