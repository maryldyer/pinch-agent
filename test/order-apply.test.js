'use strict';
// §4.4 apply-at-order + §4.4.5/§4.6 deal-breaker — the deterministic decision
// helper. Proves: store-first / BIA-hint-second, the recipe form is never
// touched (brand/organic only), one deliberate search then NO retry loop, and
// the price-vs-brand driver resolution (brand-wins / price-wins / balanced, with
// the per-form override beating the global lean).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveDriver, decideItem } = require('../bin/lib/order-apply');

// --- §4.4.5 driver resolution: per-form override beats global beats balanced ---

test('resolveDriver — per-form override wins over the global lean', () => {
  assert.equal(resolveDriver({ driverOverride: 'brand' }, 'price'), 'brand');
  assert.equal(resolveDriver({ driverOverride: 'price' }, 'brand'), 'price');
});

test('resolveDriver — falls back to the global lean, then balanced', () => {
  assert.equal(resolveDriver({ driverOverride: null }, 'brand'), 'brand');
  assert.equal(resolveDriver(null, 'price'), 'price');
  assert.equal(resolveDriver(null, null), 'balanced');
  assert.equal(resolveDriver({ brand: 'x' }, undefined), 'balanced');
});

// --- §4.4.6 store-first; BIA is only a hint when the store has no row ---

test('no stored pref → BIA hint (store is the authority; balanced)', () => {
  const d = decideItem({ pref: null, globalDriver: null, offer: {} });
  assert.equal(d.strategy, 'bia');
  assert.equal(d.brand, null);
  assert.equal(d.swap, false);
});

test('no stored pref but a global PRICE lean → cheapest (always the cheapest)', () => {
  const d = decideItem({ pref: null, globalDriver: 'price', offer: {} });
  assert.equal(d.strategy, 'cheapest');
});

// --- the recipe FORM is authoritative — the decision only carries brand/organic ---

test('decision never carries a form (pref fills brand/organic only, §4.2/§6②)', () => {
  const d = decideItem({
    pref: { brand: 'San Marzano', organic: 'yes', driverOverride: null },
    globalDriver: null,
    offer: { preferredBrandOnBia: true, preferredBrandFound: true, cheaperDiverges: false },
  });
  assert.deepEqual(Object.keys(d).sort(), ['brand', 'driver', 'organic', 'reason', 'strategy', 'swap']);
  assert.equal('form' in d, false);
  assert.equal(d.organic, 'yes'); // honored as a filter within the recipe's form
});

test('organic preference is honored; no_preference → null', () => {
  assert.equal(decideItem({ pref: { brand: null, organic: 'no' }, offer: {} }).organic, 'no');
  assert.equal(decideItem({ pref: { brand: null, organic: 'no_preference' }, offer: {} }).organic, null);
});

// --- §4.4 step 4: ONE deliberate search, then no retry loop ---

test('preferred brand not a one-click BIA option and not yet searched → ONE search', () => {
  const d = decideItem({
    pref: { brand: 'Rao', organic: 'no_preference' },
    offer: { preferredBrandOnBia: false, searched: false },
  });
  assert.equal(d.strategy, 'search');
});

test('after searching, NEVER returns search again — misses fall back (no retry loop)', () => {
  const d = decideItem({
    pref: { brand: 'Rao', organic: 'no_preference' },
    offer: { preferredBrandOnBia: false, searched: true, preferredBrandFound: false, hasBiaOrGeneric: true },
  });
  assert.notEqual(d.strategy, 'search');
  assert.equal(d.strategy, 'fallback_bia');
  assert.equal(d.swap, true);
  assert.equal(d.reason, 'brand_not_found');
});

test('searched miss with NO BIA/generic → fallback to cheapest, swap noted', () => {
  const d = decideItem({
    pref: { brand: 'Rao' },
    offer: { preferredBrandOnBia: false, searched: true, preferredBrandFound: false, hasBiaOrGeneric: false },
  });
  assert.equal(d.strategy, 'fallback_cheapest');
  assert.equal(d.swap, true);
});

// --- preferred brand available: take it unless a cheaper option diverges ------

test('preferred brand on BIA, nothing cheaper diverges → take the brand (no swap)', () => {
  const d = decideItem({
    pref: { brand: 'San Marzano' },
    offer: { preferredBrandOnBia: true, preferredBrandFound: true, cheaperDiverges: false },
  });
  assert.equal(d.strategy, 'brand');
  assert.equal(d.swap, false);
});

// --- §4.4.5 deal-breaker: a cheaper option diverges from the preferred brand ---

const diverge = (extra) => ({
  preferredBrandOnBia: true,
  preferredBrandFound: true,
  cheaperDiverges: true,
  preferredBrandCheap: false,
  ...extra,
});

test('deal-breaker, driver BRAND → take the brand (brand-wins)', () => {
  const d = decideItem({ pref: { brand: 'San Marzano', driverOverride: 'brand' }, offer: diverge() });
  assert.equal(d.strategy, 'brand');
  assert.equal(d.swap, false);
});

test('deal-breaker, driver PRICE → take the cheapest, swap noted (price-wins)', () => {
  const d = decideItem({ pref: { brand: 'San Marzano', driverOverride: 'price' }, offer: diverge() });
  assert.equal(d.strategy, 'cheapest');
  assert.equal(d.swap, true);
  assert.equal(d.reason, 'price_lean');
});

test('deal-breaker, balanced + brand is cheap → take the brand', () => {
  const d = decideItem({ pref: { brand: 'San Marzano' }, globalDriver: null, offer: diverge({ preferredBrandCheap: true }) });
  assert.equal(d.strategy, 'brand');
});

test('deal-breaker, balanced + brand NOT cheap and not BIA → cheapest, swap noted', () => {
  const d = decideItem({
    pref: { brand: 'San Marzano' },
    globalDriver: null,
    offer: { preferredBrandOnBia: false, searched: true, preferredBrandFound: true, cheaperDiverges: true, preferredBrandCheap: false },
  });
  assert.equal(d.strategy, 'cheapest');
  assert.equal(d.reason, 'balanced_not_cheap');
});

test('per-form override PRICE beats a global BRAND lean (price-wins for this item)', () => {
  const d = decideItem({
    pref: { brand: 'San Marzano', driverOverride: 'price' },
    globalDriver: 'brand',
    offer: diverge(),
  });
  assert.equal(d.driver, 'price');
  assert.equal(d.strategy, 'cheapest');
});

test('global PRICE lean applies when there is no per-form override (price-wins)', () => {
  const d = decideItem({ pref: { brand: 'San Marzano' }, globalDriver: 'price', offer: diverge() });
  assert.equal(d.driver, 'price');
  assert.equal(d.strategy, 'cheapest');
});

test('global BRAND lean, no override → take the brand', () => {
  const d = decideItem({ pref: { brand: 'San Marzano' }, globalDriver: 'brand', offer: diverge() });
  assert.equal(d.strategy, 'brand');
});
