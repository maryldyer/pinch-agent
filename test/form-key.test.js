'use strict';
// §4.2 form_key derivation — the keying "eval" against the spec's acceptance
// examples: a learned pref must GENERALIZE across phrasings of the same product
// form (crushed ≡ branded/canned/quantified crushed) and must NOT MERGE distinct
// forms (crushed ≠ diced ≠ paste ≠ fresh). This is the deterministic reference
// the agent-side rule is documented against (§4.2 honest-limitation note: the
// live keying is prompt-driven, so this proves the RULE, not model compliance).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { deriveFormKey } = require('../bin/lib/form-key');

test('§4.2 GENERALIZE — "crushed tomatoes" ≡ branded / canned / quantified crushed', () => {
  const canonical = deriveFormKey('crushed tomatoes');
  assert.equal(canonical, 'crushed tomato');
  for (const variant of [
    'San Marzano crushed canned tomatoes', // brand + container dropped
    'San Marzano Crushed Tomatoes', // case + brand
    '2 (28 oz) cans organic crushed tomatoes', // qty + unit + container + organic
    '1 28oz can of crushed tomatoes', // numeric-unit glob + "of"
  ]) {
    assert.equal(deriveFormKey(variant), canonical, `"${variant}" should key to "${canonical}"`);
  }
});

test('§4.2 DO NOT MERGE — crushed ≠ diced ≠ paste ≠ fresh (four distinct keys)', () => {
  const keys = {
    crushed: deriveFormKey('crushed tomatoes'),
    diced: deriveFormKey('diced tomatoes'),
    paste: deriveFormKey('tomato paste'),
    fresh: deriveFormKey('fresh tomatoes'),
  };
  assert.deepEqual(keys, {
    crushed: 'crushed tomato',
    diced: 'diced tomato',
    paste: 'paste tomato', // form word floated to front (order-normalized)
    fresh: 'fresh tomato',
  });
  // All four are genuinely distinct.
  assert.equal(new Set(Object.values(keys)).size, 4);
});

test('container "canned" is the form when NO other form word is present (kept)', () => {
  // "crushed canned tomatoes" → canned dropped (crushed carries the form).
  assert.equal(deriveFormKey('crushed canned tomatoes'), 'crushed tomato');
  // "canned tomatoes" alone → canned is the form, kept, distinct from fresh.
  assert.equal(deriveFormKey('canned tomatoes'), 'canned tomato');
  assert.notEqual(deriveFormKey('canned tomatoes'), deriveFormKey('fresh tomatoes'));
});

test('strips quantities, units, organic/pref descriptors; keeps the product + form', () => {
  assert.equal(deriveFormKey('2 cups organic baby spinach'), 'baby spinach'); // qty+unit+organic stripped
  assert.equal(deriveFormKey('1 lb grass-fed ground beef'), 'ground beef'); // pref phrase + unit
  assert.equal(deriveFormKey('a dozen large free-range eggs'), 'egg'); // count/size/pref + plural
  assert.equal(deriveFormKey('extra virgin olive oil'), 'extra virgin olive oil'); // grade kept (distinct variety)
});

test('token-ORDER normalization — comma-inverted phrasings key the same (never re-ask)', () => {
  // "tomatoes, crushed" ≡ "crushed tomatoes"; "beef, ground" ≡ "ground beef".
  assert.equal(deriveFormKey('tomatoes, crushed'), deriveFormKey('crushed tomatoes'));
  assert.equal(deriveFormKey('crushed tomatoes'), 'crushed tomato');
  assert.equal(deriveFormKey('beef, ground'), deriveFormKey('ground beef'));
  assert.equal(deriveFormKey('ground beef'), 'ground beef');
  // The inversion holds through brand/quantity noise too.
  assert.equal(
    deriveFormKey('tomatoes, crushed (San Marzano, 28 oz)'),
    deriveFormKey('San Marzano crushed canned tomatoes'),
  );
});

test('Unicode-fold — accents fold to base before the ASCII strip (not mangled)', () => {
  // "jalapeño" ≡ "jalapenos" (fold + plural), not "jalape o".
  assert.equal(deriveFormKey('jalapeño'), 'jalapeno');
  assert.equal(deriveFormKey('jalapeños'), 'jalapeno');
  assert.equal(deriveFormKey('jalapeño'), deriveFormKey('jalapenos'));
  // A diacritic in a brand folds rather than splitting the token: "Pomì" → "pomi".
  assert.equal(deriveFormKey('Pomì'), 'pomi');
  // Accented + inverted + form word all compose.
  assert.equal(deriveFormKey('tomatoes, puréed'), deriveFormKey('pureed tomatoes'));
});

test('empty / garbage input → empty key', () => {
  assert.equal(deriveFormKey(''), '');
  assert.equal(deriveFormKey('   '), '');
  assert.equal(deriveFormKey(null), '');
  assert.equal(deriveFormKey(42), '');
});
