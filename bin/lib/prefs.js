'use strict';
// prefs.js — the grocery purchasing-preference calls (§4.1/§4.3/§4.4), factored
// out of the `pinch-prefs` CLI so they can be unit-tested with an injected fetch
// (the onboarding.js pattern). Talks to the Chunk-2 account-scoped endpoints:
//
//   GET /api/pinch/preferences?formKey=a&formKey=b          → { preferences: [...] }
//   GET /api/pinch/preferences/unknown?formKey=a&formKey=b  → { unknown: [...] }
//   GET /api/pinch/preferences/driver                       → { driver }
//   PUT /api/pinch/preferences/driver  { driver: 'price'|'brand'|null } → { driver }
//   PUT /api/pinch/preferences  { formKey, brand?, organic?, driverOverride?, source }
//                                                            → { preference }
//
// Auth is the account FULL bearer (resolved by the CLI, passed in here), exactly
// like the other backend helpers. These functions build the request, check the
// status, and return parsed JSON; they never read env or touch process.

const ORGANIC = ['yes', 'no', 'no_preference'];
const DRIVERS = ['price', 'brand'];
const SOURCES = ['this_or_that', 'post_delivery'];

function base(backendUrl) {
  return String(backendUrl || '').replace(/\/+$/, '');
}

async function call(fetchImpl, url, { method, token, body }) {
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetchImpl(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = typeof res.text === 'function' ? await res.text() : '';
  if (!res.ok) {
    const err = new Error(`backend returned ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch {
    const err = new Error('unexpected (non-JSON) response from backend');
    err.status = res.status;
    throw err;
  }
}

/**
 * The §4.3 gap-check: of `formKeys`, return ONLY the ones with no stored
 * preference. Keys are trimmed + de-duplicated (first-seen order) before the
 * call; `max` (optional) caps how many unknowns come back — the ≤2 drip (§4.3).
 * Returns `{ unknown: string[] }`.
 */
async function gapCheck({ backendUrl, token, fetchImpl }, formKeys, { max } = {}) {
  const keys = [];
  const seen = new Set();
  for (const k of formKeys || []) {
    const key = typeof k === 'string' ? k.trim() : '';
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  if (keys.length === 0) return { unknown: [] };
  const qs = keys.map((k) => `formKey=${encodeURIComponent(k)}`).join('&');
  const data = await call(fetchImpl, `${base(backendUrl)}/api/pinch/preferences/unknown?${qs}`, {
    method: 'GET',
    token,
  });
  let unknown = Array.isArray(data.unknown) ? data.unknown : [];
  if (typeof max === 'number' && max >= 0) unknown = unknown.slice(0, max);
  return { unknown };
}

/**
 * Read the stored preferences for a set of form_keys (§4.4 apply-at-order). Keys
 * are trimmed + de-duplicated. Returns `{ preferences: [...] }` with ONLY the
 * keys that have a row (unknown keys are simply absent — the store is the
 * authority, §4.4.6). No keys → no request, `{ preferences: [] }`.
 */
async function readPreferences({ backendUrl, token, fetchImpl }, formKeys) {
  const keys = [];
  const seen = new Set();
  for (const k of formKeys || []) {
    const key = typeof k === 'string' ? k.trim() : '';
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  if (keys.length === 0) return { preferences: [] };
  const qs = keys.map((k) => `formKey=${encodeURIComponent(k)}`).join('&');
  const data = await call(fetchImpl, `${base(backendUrl)}/api/pinch/preferences?${qs}`, {
    method: 'GET',
    token,
  });
  return { preferences: Array.isArray(data.preferences) ? data.preferences : [] };
}

/**
 * Read the account's global price-vs-brand lean (§4.4.5), or `null` (balanced).
 * Returns `{ driver: 'price' | 'brand' | null }`.
 */
async function getDriverDefault({ backendUrl, token, fetchImpl }) {
  const data = await call(fetchImpl, `${base(backendUrl)}/api/pinch/preferences/driver`, {
    method: 'GET',
    token,
  });
  const driver = data && (data.driver === 'price' || data.driver === 'brand') ? data.driver : null;
  return { driver };
}

/**
 * Set (or clear, with `null`) the account's global price-vs-brand lean (§4.4.5).
 * `driver` must be 'price', 'brand', or null (null → balanced). Validates locally
 * so the CLI fails fast rather than relying on a 422. Returns `{ driver }`.
 */
async function setDriverDefault({ backendUrl, token, fetchImpl }, driver) {
  if (driver !== null && !DRIVERS.includes(driver)) {
    throw new Error(`driver must be one of: ${DRIVERS.join(', ')} (or null to clear)`);
  }
  const data = await call(fetchImpl, `${base(backendUrl)}/api/pinch/preferences/driver`, {
    method: 'PUT',
    token,
    body: { driver },
  });
  const resolved = data && (data.driver === 'price' || data.driver === 'brand') ? data.driver : null;
  return { driver: resolved };
}

/**
 * Upsert one preference (§4.1). `formKey` + `source` are required; `brand`,
 * `organic`, and `driverOverride` are optional. Validates the enums locally so
 * the CLI fails fast with a clear message rather than relying on a 422. Returns
 * `{ preference }`.
 */
async function upsertPreference({ backendUrl, token, fetchImpl }, pref) {
  const formKey = typeof pref.formKey === 'string' ? pref.formKey.trim() : '';
  if (!formKey) throw new Error('formKey is required');
  if (!SOURCES.includes(pref.source)) {
    throw new Error(`source must be one of: ${SOURCES.join(', ')}`);
  }
  if (pref.organic !== undefined && pref.organic !== null && !ORGANIC.includes(pref.organic)) {
    throw new Error(`organic must be one of: ${ORGANIC.join(', ')}`);
  }
  if (pref.driverOverride !== undefined && pref.driverOverride !== null && !DRIVERS.includes(pref.driverOverride)) {
    throw new Error(`driverOverride must be one of: ${DRIVERS.join(', ')}`);
  }
  const body = { formKey, source: pref.source };
  if (pref.brand !== undefined) body.brand = pref.brand; // string or null
  if (pref.organic !== undefined) body.organic = pref.organic;
  if (pref.driverOverride !== undefined) body.driverOverride = pref.driverOverride;
  return call(fetchImpl, `${base(backendUrl)}/api/pinch/preferences`, {
    method: 'PUT',
    token,
    body,
  });
}

module.exports = {
  gapCheck,
  readPreferences,
  getDriverDefault,
  setDriverDefault,
  upsertPreference,
  ORGANIC,
  DRIVERS,
  SOURCES,
};
