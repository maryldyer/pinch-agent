'use strict';
// onboarding.js — agent-side multi-tenant onboarding against the frozen Pinch
// backend contract (spec §5 register / §7 connect-dashboard; Chunks 5 & 7).
//
// This module is deliberately pure/injectable: every network call goes through a
// `fetchImpl` argument (defaulting to the global `fetch`) and every filesystem
// path is overridable, so the boot logic is unit-testable WITHOUT a live backend
// (the backend /register + /connect-dashboard endpoints are not deployed yet —
// see the deferred live-integration points in the repo notes).
//
// Secret hygiene (brief guard): this module NEVER writes the raw
// PLOW_AGENT_TOKEN or any issued token to a logger. The `logger` callback only
// ever receives non-secret status strings. Issued tokens live only in the
// mode-0600 cache file and in return values handed to the caller.

const fs = require('node:fs');
const path = require('node:path');

// Persistent state dir on the agent's volume (mounted at /var/lib/plow — see
// compose.yml). The token pair is cached here so a normal reboot skips register.
const DEFAULT_STATE_DIR = '/var/lib/plow/pinch';
// Index Identity mint host (Plow). `GET /v1/auth/index-identity` with the agent's
// real Plow bearer returns a short-lived assertion; the bearer never leaves here.
const DEFAULT_INDEX_API_BASE = 'https://api.plow.co';

class OnboardingError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'OnboardingError';
    this.code = code || 'ONBOARDING_ERROR';
  }
}

// --- token cache (volume) --------------------------------------------------

function tokensPath(opts = {}) {
  if (opts.tokensPath) return opts.tokensPath;
  if (process.env.PINCH_TOKENS_PATH) return process.env.PINCH_TOKENS_PATH;
  const dir = opts.stateDir || process.env.PINCH_STATE_DIR || DEFAULT_STATE_DIR;
  return path.join(dir, 'tokens.json');
}

// Returns { full, readonly } from the cached pair, or null when absent/unusable.
// A malformed or partial file resolves to null so the caller falls back cleanly.
function readCachedTokens(opts = {}) {
  const p = tokensPath(opts);
  let raw;
  try {
    raw = fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed.full !== 'string' || !parsed.full) return null;
  return {
    full: parsed.full,
    readonly: typeof parsed.readonly === 'string' && parsed.readonly ? parsed.readonly : null,
  };
}

// Persists the pair to the volume at mode 0600 (owner-only). Written to a temp
// file then renamed so a crash never leaves a half-written token file.
function writeCachedTokens(pair, opts = {}) {
  if (!pair || typeof pair.full !== 'string' || !pair.full) {
    throw new OnboardingError('refusing to cache a token pair without a full token', 'BAD_PAIR');
  }
  const p = tokensPath(opts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = JSON.stringify({ full: pair.full, readonly: pair.readonly ?? null }, null, 2) + '\n';
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, body, { mode: 0o600 });
  fs.chmodSync(tmp, 0o600); // defensive — umask can mask the create mode
  fs.renameSync(tmp, p);
  fs.chmodSync(p, 0o600);
  return p;
}

// --- Plow assertion + backend register -------------------------------------

// Mint a short-lived Index Identity assertion from Plow with the agent's own
// bearer. The bearer stays in this process; only the assertion travels onward.
async function mintAssertion({ plowAgentToken, indexApiBase, fetchImpl } = {}) {
  const token = (plowAgentToken || '').trim();
  if (!token || token === 'proxied') {
    throw new OnboardingError('no usable PLOW_AGENT_TOKEN to mint an Index Identity assertion', 'NO_PLOW_TOKEN');
  }
  const base = (indexApiBase || DEFAULT_INDEX_API_BASE).replace(/\/+$/, '');
  const fetchFn = fetchImpl || globalThis.fetch;
  let res;
  try {
    res = await fetchFn(`${base}/v1/auth/index-identity`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    throw new OnboardingError(`index-identity mint unreachable: ${e.message}`, 'MINT_UNREACHABLE');
  }
  if (!res.ok) {
    throw new OnboardingError(`index-identity mint failed: HTTP ${res.status}`, 'MINT_FAILED');
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new OnboardingError('index-identity mint returned non-JSON', 'MINT_BAD_RESPONSE');
  }
  if (!data || typeof data.assertion !== 'string' || !data.assertion) {
    throw new OnboardingError('index-identity mint returned no assertion', 'MINT_BAD_RESPONSE');
  }
  return data.assertion;
}

// POST the assertion to the backend register endpoint, presenting it in the
// CORRECTED header `X-Plow-Index-Assertion` (NOT Authorization: Bearer — the
// Plow verify endpoint ignores Authorization; see the memory note). Returns the
// freshly-issued { full, readonly } token pair (+ optional account info).
//
// `rotate` requests the re-register/rotate semantics (§5.6): same account,
// new full token minted, prior full token revoked.
async function registerWithBackend({ backendUrl, assertion, rotate, fetchImpl } = {}) {
  const base = (backendUrl || '').replace(/\/+$/, '');
  if (!base) throw new OnboardingError('PINCH_BACKEND_URL is not set', 'NO_BACKEND');
  if (!assertion) throw new OnboardingError('no assertion to register with', 'NO_ASSERTION');
  const fetchFn = fetchImpl || globalThis.fetch;
  let res;
  try {
    res = await fetchFn(`${base}/api/pinch/register`, {
      method: 'POST',
      headers: {
        'X-Plow-Index-Assertion': assertion,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rotate ? { rotate: true } : {}),
    });
  } catch (e) {
    throw new OnboardingError(`register unreachable: ${e.message}`, 'REGISTER_UNREACHABLE');
  }
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    const code = res.status === 401 ? 'ASSERTION_REJECTED' : res.status === 429 ? 'RATE_LIMITED' : 'REGISTER_FAILED';
    throw new OnboardingError(`register failed: HTTP ${res.status}: ${text.slice(0, 200)}`, code);
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new OnboardingError('register returned non-JSON', 'REGISTER_BAD_RESPONSE');
  }
  if (!data || typeof data.full !== 'string' || !data.full) {
    throw new OnboardingError('register returned no full token', 'REGISTER_BAD_RESPONSE');
  }
  return {
    full: data.full,
    readonly: typeof data.readonly === 'string' && data.readonly ? data.readonly : null,
    account: data.account ?? null,
  };
}

// --- orchestration: self-register on boot ----------------------------------

// The boot entry point. On a normal reboot this is a cheap no-op: a cached token
// pair on the volume short-circuits before any network call. Only a first-ever
// boot (or a wiped volume) — or an explicit `rotate` — mints an assertion,
// registers, and persists the pair.
//
// Returns { registered, rotated, tokens }.
async function ensureRegistered(opts = {}) {
  const {
    rotate = false,
    stateDir,
    tokensPath: tp,
    backendUrl = process.env.PINCH_BACKEND_URL,
    plowAgentToken = process.env.PLOW_AGENT_TOKEN,
    indexApiBase = process.env.PLOW_INDEX_API_BASE,
    fetchImpl = globalThis.fetch,
    logger = () => {},
  } = opts;
  const cacheOpts = { stateDir, tokensPath: tp };

  if (!rotate) {
    const cached = readCachedTokens(cacheOpts);
    if (cached) {
      logger('cached token pair present on volume — skipping registration');
      return { registered: false, rotated: false, tokens: cached };
    }
  }

  logger(rotate ? 'rotation requested — minting a fresh Index Identity assertion' : 'no cached token — minting an Index Identity assertion');
  const assertion = await mintAssertion({ plowAgentToken, indexApiBase, fetchImpl });
  logger('assertion minted — calling backend /api/pinch/register');
  const tokens = await registerWithBackend({ backendUrl, assertion, rotate, fetchImpl });
  const written = writeCachedTokens(tokens, cacheOpts);
  logger(`registered — token pair cached at ${written} (mode 0600)`);
  return { registered: true, rotated: !!rotate, tokens };
}

// --- "connect dashboard" (§7 / Chunk 7) ------------------------------------

// Produce a read-only token for the user's dashboard, plus the wall-sync URL.
//
// Preferred (production, spec §7): POST the backend connect-dashboard endpoint
// with the account full token — it mints a FRESH readonly and revokes the prior
// one (rotate). That endpoint is NOT live yet (Chunk 7), so when it is
// unreachable/unusable this falls back to the once-off readonly cached at
// registration (§7, "Chunk 5 returns a readonly once; the agent caches it").
async function connectDashboard(opts = {}) {
  const {
    backendUrl = process.env.PINCH_BACKEND_URL,
    stateDir,
    tokensPath: tp,
    allowCacheFallback = true,
    fetchImpl = globalThis.fetch,
    logger = () => {},
  } = opts;
  const cacheOpts = { stateDir, tokensPath: tp };
  const cached = readCachedTokens(cacheOpts);
  const fullToken = cached && cached.full ? cached.full : (process.env.PINCH_API_TOKEN || '').trim();
  const base = (backendUrl || '').replace(/\/+$/, '');
  const wallSyncUrl = base ? `${base}/wall-sync.mjs` : null;
  const fetchFn = fetchImpl || globalThis.fetch;

  // Preferred path: rotate a fresh readonly via the backend (Chunk 7).
  if (fullToken && base) {
    try {
      const res = await fetchFn(`${base}/api/pinch/connect-dashboard`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${fullToken}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        let data;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        if (data && typeof data.readonly === 'string' && data.readonly) {
          logger('rotated a fresh dashboard token via the connect-dashboard endpoint');
          return { source: 'rotated', readonly: data.readonly, wallSyncUrl };
        }
        logger('connect-dashboard endpoint returned no readonly token');
      } else {
        // Endpoint reachable but not usable yet (e.g. 404 before Chunk 7 ships).
        logger(`connect-dashboard endpoint not usable (HTTP ${res.status})`);
      }
    } catch (e) {
      logger(`connect-dashboard endpoint unreachable: ${e.message}`);
    }
  }

  // Fallback: the once-off readonly token cached at registration.
  if (allowCacheFallback && cached && cached.readonly) {
    logger('using the cached readonly token from registration');
    return { source: 'cached', readonly: cached.readonly, wallSyncUrl };
  }

  throw new OnboardingError(
    'no dashboard token available (connect-dashboard endpoint not live and no cached readonly token)',
    'NO_READONLY',
  );
}

module.exports = {
  OnboardingError,
  DEFAULT_STATE_DIR,
  DEFAULT_INDEX_API_BASE,
  tokensPath,
  readCachedTokens,
  writeCachedTokens,
  mintAssertion,
  registerWithBackend,
  ensureRegistered,
  connectDashboard,
};
