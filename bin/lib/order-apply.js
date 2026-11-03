'use strict';
// order-apply.js — the DETERMINISTIC order-time decision for ONE grocery item
// (§4.4 apply-at-order + §4.4.5/§4.6 deal-breaker). Pure logic, no network: the
// order-groceries skill gathers the facts from Instacart (what's on Buy-it-again,
// what one search surfaced, what's cheapest) and the stored pref/lean from the
// pinch-prefs helper, then calls these to decide what to add — so the policy is
// consistent and testable instead of re-reasoned per item by the model.
//
// Two invariants from the spec live HERE so they can't drift:
//   • The RECIPE FORM is authoritative (§4.2/§6②). These functions decide only
//     BRAND / ORGANIC within the form the recipe already fixed; there is no
//     "form" field in the input or output. A pref never changes the form.
//   • STORE is the authority; BIA is only a HINT when the store has no row for
//     the key (§4.4.6). No pref → use the owner's usual Buy-it-again.
//
// The one deliberate search (§4.4 step 4) is modeled as a returnable strategy
// ('search'): decideItem returns it at most ONCE (guarded by offer.searched), so
// there is never a per-item retry loop. Order-level completeness ("no cap") and
// the Instacart bot-pushback backoff are procedural and live in the SKILL, not
// here.

/**
 * Resolve the effective price-vs-brand driver for an item (§4.4.5): the per-form
 * `driver_override` wins, else the account's global lean, else 'balanced'.
 * @param {{driverOverride?: string|null}|null} pref
 * @param {'price'|'brand'|null|undefined} globalDriver
 * @returns {'price'|'brand'|'balanced'}
 */
function resolveDriver(pref, globalDriver) {
  const override = pref && pref.driverOverride;
  if (override === 'price' || override === 'brand') return override;
  if (globalDriver === 'price' || globalDriver === 'brand') return globalDriver;
  return 'balanced';
}

/** The organic filter the chosen product must satisfy, or null when the owner
 * has no organic preference. (Applies within the recipe's form, never changes
 * it.) */
function resolveOrganic(pref) {
  const o = pref && pref.organic;
  return o === 'yes' || o === 'no' ? o : null;
}

/**
 * Decide what to add for one item.
 *
 * @param {object} args
 * @param {{brand?: string|null, organic?: string, driverOverride?: string|null}|null} args.pref
 *        The stored pref for this form_key, or null when the store has no row.
 * @param {'price'|'brand'|null} [args.globalDriver] The account global lean.
 * @param {object} args.offer Facts about this item on Instacart right now:
 *   @param {boolean} offer.preferredBrandOnBia  preferred brand is a one-click BIA option
 *   @param {boolean} offer.preferredBrandFound  preferred brand is available (BIA or after the search)
 *   @param {boolean} offer.searched             the one deliberate search has been done
 *   @param {boolean} offer.preferredBrandCheap  preferred brand is at/near cheapest (balanced tie-break)
 *   @param {boolean} offer.cheaperDiverges      a cheaper option diverges from the preferred brand
 *   @param {boolean} offer.hasBiaOrGeneric      some BIA/generic fallback exists for this item
 * @returns {{strategy: string, brand: string|null, organic: string|null,
 *            driver: string, swap: boolean, reason: string|null}}
 *   strategy ∈ 'search' | 'brand' | 'cheapest' | 'bia' | 'fallback_bia' | 'fallback_cheapest'
 */
function decideItem({ pref, globalDriver = null, offer = {} }) {
  const organic = resolveOrganic(pref);
  const driver = resolveDriver(pref, globalDriver);
  const brand = pref && typeof pref.brand === 'string' && pref.brand.trim() ? pref.brand.trim() : null;

  const out = (strategy, extra = {}) => ({
    strategy,
    brand,
    organic,
    driver,
    swap: false,
    reason: null,
    ...extra,
  });

  // No brand to assert (no pref row, or a row with no brand — e.g. the owner
  // waved it off). Store had nothing to override BIA with, so BIA is the hint —
  // unless the resolved driver is 'price', which means "always the cheapest".
  if (!brand) {
    if (driver === 'price') return out('cheapest');
    return out('bia');
  }

  // Preferred brand present. If it isn't a one-click BIA option and we haven't
  // searched yet, do the ONE deliberate search first (§4.4 step 4).
  if (!offer.preferredBrandOnBia && !offer.searched) {
    return out('search');
  }

  // Brand is on BIA, or the one search is done — decide finally (never search again).
  if (offer.preferredBrandFound) {
    if (!offer.cheaperDiverges) return out('brand'); // no price-vs-brand conflict
    // Deal-breaker: the preferred brand and a cheaper option diverge (§4.4.5).
    if (driver === 'brand') return out('brand');
    if (driver === 'price') return out('cheapest', { swap: true, reason: 'price_lean' });
    // balanced: take the brand if it's cheap or a one-click BIA, else the cheapest.
    if (offer.preferredBrandCheap || offer.preferredBrandOnBia) return out('brand');
    return out('cheapest', { swap: true, reason: 'balanced_not_cheap' });
  }

  // Searched and the preferred brand did not surface — fall back, note the swap,
  // never re-search this item (§4.4 step 4). BIA/generic if there is one, else
  // the cheapest per the driver rule.
  if (offer.hasBiaOrGeneric) return out('fallback_bia', { swap: true, reason: 'brand_not_found' });
  return out('fallback_cheapest', { swap: true, reason: 'brand_not_found' });
}

module.exports = { resolveDriver, resolveOrganic, decideItem };
