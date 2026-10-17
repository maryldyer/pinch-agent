'use strict';
// pinch-http — the shared HTTP plumbing for the grocery + meal-plan helpers.
//
// Every helper reads the same two env vars the existing pinch-* tools do —
// PINCH_BACKEND_URL and PINCH_API_TOKEN — and talks to the account-scoped
// `/api/pinch/*` API. The backend owns ALL consolidation (the single engine,
// §6/§9): these helpers only shuttle JSON, they never aggregate ingredients
// locally. Keeping this in one place means the 11 grocery/meal-plan helpers can
// stay a few lines each and can't drift on auth, error codes, or base-URL
// handling.
//
// Exit codes (match the existing helpers): 2 bad usage / missing env,
// 4 backend unreachable, 5 auth (401/403), 1 everything else.
const BASE = (process.env.PINCH_BACKEND_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.PINCH_API_TOKEN || '';

/** A `die(msg, code?)` that prefixes the helper's name (like the other tools). */
function dieFor(name) {
  return (msg, code = 1) => {
    process.stderr.write(`${name}: ${msg}\n`);
    process.exit(code);
  };
}

/** Assert the shared env is present, else die 2. Call once per helper at start. */
function requireEnv(die) {
  if (!BASE) die('PINCH_BACKEND_URL is not set', 2);
  if (!TOKEN) die('PINCH_API_TOKEN is not set', 2);
}

/**
 * Call the API. `method`/`path` (path starts with `/api/pinch/...`); optional
 * JSON `body`. Returns `{ res, text }`. On a transport failure or non-2xx it
 * calls `die` with the right code and does not return. `allow404` lets a caller
 * handle 404 itself (returns `{ res, text }` with res.status 404) — used where a
 * 404 is a normal "not found there" answer, not an error.
 */
async function api(die, method, path, { body, allow404 = false } = {}) {
  let res;
  try {
    const headers = { Authorization: `Bearer ${TOKEN}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    die(`backend unreachable: ${e.message}`, 4);
  }
  const text = await res.text();
  if (res.status === 404 && allow404) return { res, text };
  if (!res.ok) {
    die(`backend returned ${res.status}: ${text}`, res.status === 401 || res.status === 403 ? 5 : 1);
  }
  return { res, text };
}

/** Parse a JSON API response body, or die 1 on garbage. */
function parse(die, text) {
  try {
    return JSON.parse(text);
  } catch {
    die('unexpected (non-JSON) response from backend', 1);
  }
}

module.exports = { BASE, TOKEN, dieFor, requireEnv, api, parse };
