'use strict';
// Shared test helpers: a temp state dir and a scriptable fake fetch.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function tmpTokensPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinch-onboard-'));
  return { dir, tokensPath: path.join(dir, 'tokens.json') };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Build a Response-like object.
function resp({ ok = true, status = 200, json, text }) {
  const bodyText = text != null ? text : json != null ? JSON.stringify(json) : '';
  return {
    ok,
    status,
    async json() {
      if (json != null) return json;
      return JSON.parse(bodyText);
    },
    async text() {
      return bodyText;
    },
  };
}

// A fake fetch that records calls and replies per a route map keyed by a
// substring of the URL. Each handler is `(url, init) => respSpec` or a static
// respSpec. Unmatched URLs throw (surfaces accidental network calls in tests).
function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    for (const [match, handler] of Object.entries(routes)) {
      if (url.includes(match)) {
        const spec = typeof handler === 'function' ? handler(url, init) : handler;
        if (spec instanceof Error) throw spec;
        return resp(spec);
      }
    }
    throw new Error(`fakeFetch: no route for ${url}`);
  };
  fn.calls = calls;
  return fn;
}

// A fetch that fails the test if it is ever called.
function neverFetch() {
  return async (url) => {
    throw new Error(`fetch must not be called, but was: ${url}`);
  };
}

module.exports = { tmpTokensPath, cleanup, resp, fakeFetch, neverFetch };
