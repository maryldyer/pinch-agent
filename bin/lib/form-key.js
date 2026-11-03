'use strict';
// form-key.js — the §4.2 "product form" key derivation. This is the SINGLE
// agent-side authority for turning a recipe ingredient line into the stable
// `form_key` the preference store is keyed by (§4.1). The gap-check (§4.3) and
// the apply-at-order step (§4.4) both derive keys through THIS function, so they
// always agree on what "crushed tomatoes" keys to.
//
// THE RULE (§4.2):
//   KEEP product-form words    — crushed / diced / paste / ground / whole /
//                                fresh / … (the FORM set below). A form word is
//                                what makes "crushed tomatoes" a different
//                                product from "diced tomatoes".
//   STRIP brand names          — "San Marzano crushed tomatoes" → "crushed
//                                tomato". Brands are open-ended; the BRANDS list
//                                here is a convenience for the common ones, and
//                                the AGENT (which has the recipe context) is the
//                                real authority — it drops a brand it recognizes
//                                before/while keying. (Honest limitation, §4.2:
//                                keying is prompt-driven, not a hard invariant.)
//   STRIP organic / pref words — organic, free-range, low-sodium, … (PREF).
//   STRIP quantities + units   — "2 (28 oz) cans …" → the numbers and units go.
//   DROP "canned" (+ jar/box/…) WHEN A FORM WORD IS PRESENT — the form word
//                                already carries the product form, so the
//                                container is redundant ("crushed (canned)
//                                tomatoes" keys on "crushed tomato"). With NO
//                                form word, the container word IS the form and is
//                                kept ("canned tomatoes" → "canned tomato",
//                                distinct from "fresh tomatoes").
//
// Do NOT reuse the backend grocery-consolidation normalizer — it STRIPS form
// words (the opposite of what's needed here).
//
// Output: lowercase tokens with any form words floated to the front (so word
// order and comma inversions don't matter), diacritics folded, simple plurals
// normalized, joined by a single space. It is an opaque key; show the owner the
// real ingredient, not this.

/** Product-form words that are KEPT — the distinction a preference attaches to.
 * Extensible; the six in §4.2 (crushed/diced/paste/ground/whole/fresh) plus the
 * common cooking forms. "canned" is deliberately NOT here (see CONTAINER). */
const FORM = new Set([
  'crushed', 'diced', 'paste', 'ground', 'whole', 'fresh', 'frozen', 'dried',
  'minced', 'sliced', 'shredded', 'grated', 'chopped', 'pureed', 'puree',
  'strained', 'halved', 'quartered', 'stewed', 'mashed', 'cubed', 'riced',
  'flaked', 'powdered', 'smoked', 'roasted', 'toasted', 'pickled',
]);

/** Container / packaging words. Dropped ONLY when a FORM word is also present
 * (then they are redundant); otherwise kept (they serve as the form). */
const CONTAINER = new Set([
  'canned', 'can', 'cans', 'jar', 'jarred', 'jars', 'bottle', 'bottled',
  'bottles', 'box', 'boxed', 'bag', 'bagged', 'package', 'packaged', 'pkg',
  'tin', 'tinned', 'carton', 'container', 'pouch',
]);

/** Measurement units — always stripped. */
const UNITS = new Set([
  'cup', 'cups', 'c', 'tbsp', 'tbs', 'tablespoon', 'tablespoons', 'tsp',
  'teaspoon', 'teaspoons', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound',
  'pounds', 'g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms', 'mg', 'ml',
  'milliliter', 'milliliters', 'l', 'liter', 'liters', 'litre', 'litres',
  'pinch', 'dash', 'clove', 'cloves', 'stick', 'sticks', 'head', 'heads',
  'bunch', 'bunches', 'sprig', 'sprigs', 'stalk', 'stalks', 'quart', 'quarts',
  'pint', 'pints', 'gallon', 'gallons', 'fl',
]);

/** Grammatical filler / articles / connectors — stripped (they never carry a
 * product form). Kept minimal so they can't eat a real ingredient word. */
const FILLER = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'plus', 'for', 'to']);

/** Count words — stripped like numerals. */
const NUMWORDS = new Set([
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'dozen', 'half', 'quarter', 'couple', 'few', 'several',
]);

/** Single-word organic / preference / size descriptors — stripped. Minimal and
 * extensible; grade/variety words (extra, virgin, …) are deliberately NOT here,
 * so "extra virgin olive oil" stays distinct from plain "olive oil". */
const PREF = new Set([
  'organic', 'natural', 'unsalted', 'salted', 'raw', 'ripe', 'large', 'small',
  'medium', 'jumbo', 'lite', 'premium', 'fancy',
]);

/** Multi-word pref phrases, removed before tokenizing (hyphens are already
 * spaces by then, so "free-range" matches "free range"). */
const PREF_PHRASES = [
  'free range', 'cage free', 'grass fed', 'non gmo', 'low sodium',
  'no salt added', 'reduced fat', 'fat free', 'low fat', 'extra large',
];

/** Known brand phrases, removed before tokenizing. NON-EXHAUSTIVE convenience —
 * the agent is the real brand authority (§4.2). Stored in the post-punctuation
 * form ("hunt's" → "hunt s"). */
const BRANDS = [
  'san marzano', 'muir glen', 'del monte', 'hunt s', 'contadina', 'cento',
  'heinz', 'rao s', 'barilla', 'bertolli', 'kerrygold', 'land o lakes',
  'vital farms', 'horizon', 'chobani', 'fairlife', 'tillamook',
];

/** Normalize a few common English plurals so "tomatoes" and "tomato" key alike.
 * Deliberately simple (keys, not grammar); irregular plurals are left as-is. */
function singularize(word) {
  if (word.length <= 3) return word;
  if (word.endsWith('oes')) return word.slice(0, -2); // tomatoes → tomato
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'; // berries → berry
  if (/(?:ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2); // boxes → box
  if (word.endsWith('s') && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1); // beans → bean
  return word;
}

/** Is a token a numeral / fraction / range / numeric-unit glob (e.g. "28oz")? */
function isNumeric(token) {
  return /^\d/.test(token) || /^\d+[a-z]*$/.test(token);
}

/**
 * Derive the §4.2 `form_key` for an ingredient line (or an already-trimmed
 * product phrase). Returns '' for empty/garbage input.
 */
function deriveFormKey(line) {
  if (typeof line !== 'string') return '';
  // Unicode-fold diacritics BEFORE the ASCII strip, so an accented letter folds
  // to its base rather than being blown away as punctuation: "jalapeño" →
  // "jalapeno" (≡ "jalapenos"), "Pomì" → "pomi" (not "pom i"). NFD splits a
  // letter into base + combining marks; we drop the marks (U+0300–U+036F).
  let s = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/\([^)]*\)/g, ' '); // drop parentheticals, e.g. "(28 oz)"
  s = s.replace(/[^a-z0-9\s]/g, ' '); // punctuation/hyphens (and commas) → spaces
  s = ` ${s.replace(/\s+/g, ' ').trim()} `; // pad for whole-phrase matching
  for (const phrase of BRANDS) s = s.split(` ${phrase} `).join(' ');
  for (const phrase of PREF_PHRASES) s = s.split(` ${phrase} `).join(' ');
  const tokens = s.trim().split(/\s+/).filter(Boolean);

  const hasForm = tokens.some((t) => FORM.has(t));
  const kept = [];
  const seen = new Set();
  for (const t of tokens) {
    if (isNumeric(t) || NUMWORDS.has(t)) continue;
    if (FILLER.has(t)) continue;
    if (UNITS.has(t)) continue;
    if (PREF.has(t)) continue;
    if (CONTAINER.has(t) && hasForm) continue; // redundant with the form word
    const w = singularize(t);
    if (!w || seen.has(w)) continue; // de-dupe repeats, preserve first order
    seen.add(w);
    kept.push(w);
  }
  // Token-ORDER normalization: float form words to the front, keeping the
  // relative order within each group. This makes comma-inverted phrasings key
  // the same — "tomatoes, crushed" ≡ "crushed tomatoes" (→ "crushed tomato"),
  // "beef, ground" ≡ "ground beef" (→ "ground beef") — so the same product is
  // never re-asked and a pref generalizes across how a recipe happens to phrase
  // it. (Deterministic and both-sides-consistent; "tomato paste" keys to the
  // form-first "paste tomato" — an opaque key, shown to no one.)
  const forms = kept.filter((w) => FORM.has(w));
  const rest = kept.filter((w) => !FORM.has(w));
  return [...forms, ...rest].join(' ');
}

module.exports = { deriveFormKey, FORM, CONTAINER, UNITS, PREF, PREF_PHRASES, BRANDS, singularize };
