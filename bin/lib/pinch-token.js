'use strict';
// pinch-token.js — single source of truth for which bearer the backend helpers
// (pinch-save/get/search) present. The agent's own account tokens are issued at
// registration and cached on the volume (see onboarding.js); the legacy
// PINCH_API_TOKEN env (= backend PINCH_RECIPE_TOKEN) is now only the
// bootstrap/fallback used before the cache lands or if registration is deferred.
//
// Resolution order (full):      cached pair .full  →  PINCH_API_TOKEN
// Resolution order (readonly):  cached pair .readonly  →  PINCH_READONLY_TOKEN

const { readCachedTokens } = require('./onboarding');

function resolveFullToken(opts = {}) {
  const cached = readCachedTokens(opts);
  if (cached && cached.full) return cached.full;
  return (process.env.PINCH_API_TOKEN || '').trim();
}

function resolveReadonlyToken(opts = {}) {
  const cached = readCachedTokens(opts);
  if (cached && cached.readonly) return cached.readonly;
  return (process.env.PINCH_READONLY_TOKEN || '').trim();
}

module.exports = { resolveFullToken, resolveReadonlyToken };
