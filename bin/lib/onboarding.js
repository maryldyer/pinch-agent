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

// Mint a short-lived Index Identity assertion from Plow. The bearer stays in this
// process; only the assertion travels onward.
//
// Two runtimes, two token mechanisms (see the Plow cloud-agents image contract):
//   • LOCAL / self-hosted (`plow-agents deploy --local`): the real agent bearer is
//     in `PLOW_AGENT_TOKEN`. Call the index host directly with `Authorization:
//     Bearer <token>`.
//   • MANAGED / exe.dev (the published-image 1-click path): the token NEVER reaches
//     the VM, so `PLOW_AGENT_TOKEN` is unset (or the placeholder "proxied").
//     `PLOW_API_BASE` is an exe.dev proxy that forwards to the Plow API and injects
//     the agent's token into every request. So mint THROUGH `PLOW_API_BASE` with NO
//     Authorization header and let the proxy add the bearer (mirrors the contract's
//     own `/v1/agents/cloud/me` example). Without this, managed self-register has no
//     bearer and fails -> no account token -> "no API token available".
async function mintAssertion({ plowAgentToken, indexApiBase, plowApiBase, fetchImpl } = {}) {
  const token = (plowAgentToken || '').trim();
  const hasRealToken = token && token !== 'proxied';
  let url, headers;
  if (hasRealToken) {
    // Local / self-hosted: real bearer in env, call the index host directly.
    const base = (indexApiBase || DEFAULT_INDEX_API_BASE).replace(/\/+$/, '');
    url = `${base}/v1/auth/index-identity`;
    headers = { Authorization: `Bearer ${token}` };
  } else {
    // Managed (exe.dev): mint through the token-injecting proxy, no bearer of ours.
    const base = (plowApiBase || '').replace(/\/+$/, '');
    if (!base) {
      throw new OnboardingError('no PLOW_AGENT_TOKEN and no PLOW_API_BASE proxy to mint an Index Identity assertion', 'NO_PLOW_TOKEN');
    }
    url = `${base}/v1/auth/index-identity`;
    headers = {};
  }
  const fetchFn = fetchImpl || globalThis.fetch;
  let res;
  try {
    res = await fetchFn(url, {
      method: 'GET',
      headers,
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
    plowApiBase = process.env.PLOW_API_BASE,
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
  const assertion = await mintAssertion({ plowAgentToken, indexApiBase, plowApiBase, fetchImpl });
  logger('assertion minted — calling backend /api/pinch/register');
  const tokens = await registerWithBackend({ backendUrl, assertion, rotate, fetchImpl });
  const written = writeCachedTokens(tokens, cacheOpts);
  logger(`registered — token pair cached at ${written} (mode 0600)`);
  return { registered: true, rotated: !!rotate, tokens };
}

// --- "connect dashboard" (§7 / Chunk 7) ------------------------------------

// Hand the owner a ready-to-paste embed URL for their dashboard (the Hive wall),
// backed by a READ-WRITE token so they can add groceries and edit lists from the
// wall, not just view.
//
// Production contract (spec §7, read-write embed): POST the backend
// connect-dashboard endpoint with the account full token. The backend mints a
// dedicated FULL (read-write) token and returns the ready-to-paste link that
// already carries it: `{ embedUrl: ".../embed?token=<FULL>", token: "<FULL>" }`
// (there is NO `readonly` field anymore). We RELAY that embedUrl as-is — the
// backend owns the public origin — falling back to building it from `token` only
// if the response omitted the URL.
//
// We deliberately DO NOT fall back to the once-off readonly token cached at
// registration: a readonly link renders the library but 403s every write, which
// is exactly the "can't add groceries from the wall" failure. On any endpoint
// hiccup we surface an error so the caller can retry, never a silent readonly
// (or stale) link.
async function connectDashboard(opts = {}) {
  const {
    backendUrl = process.env.PINCH_BACKEND_URL,
    stateDir,
    tokensPath: tp,
    fetchImpl = globalThis.fetch,
    logger = () => {},
  } = opts;
  const cacheOpts = { stateDir, tokensPath: tp };
  const cached = readCachedTokens(cacheOpts);
  const fullToken = cached && cached.full ? cached.full : (process.env.PINCH_API_TOKEN || '').trim();
  const base = (backendUrl || '').replace(/\/+$/, '');
  const fetchFn = fetchImpl || globalThis.fetch;

  if (!fullToken) {
    throw new OnboardingError('no account token available to connect the dashboard', 'NO_FULL_TOKEN');
  }
  if (!base) {
    throw new OnboardingError('PINCH_BACKEND_URL is not set', 'NO_BACKEND');
  }

  // A read-write embed URL carrying `token` (the /embed route authorizes by the
  // token in the query string; a full token makes the embed interactive).
  const embedUrlFor = (token) => (token ? `${base}/embed?token=${encodeURIComponent(token)}` : null);

  let res;
  try {
    res = await fetchFn(`${base}/api/pinch/connect-dashboard`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${fullToken}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch (e) {
    throw new OnboardingError(`connect-dashboard endpoint unreachable: ${e.message}`, 'CONNECT_UNREACHABLE');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OnboardingError(
      `connect-dashboard failed: HTTP ${res.status}: ${text.slice(0, 200)}`,
      res.status === 401 ? 'CONNECT_UNAUTHORIZED' : 'CONNECT_FAILED',
    );
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new OnboardingError('connect-dashboard returned non-JSON', 'CONNECT_BAD_RESPONSE');
  }

  // Relay the backend's read-write link. Prefer the endpoint's own embedUrl;
  // fall back to building it from the returned full token if the URL was omitted.
  const token = typeof data?.token === 'string' && data.token ? data.token : null;
  const embedUrl =
    typeof data?.embedUrl === 'string' && data.embedUrl ? data.embedUrl : embedUrlFor(token);

  if (embedUrl) {
    logger('minted a fresh read-write dashboard link via the connect-dashboard endpoint');
    return { source: 'rotated', token, embedUrl };
  }

  // 200 but nothing usable — surface it rather than hand a stale/readonly link.
  throw new OnboardingError('connect-dashboard returned no embed link or token', 'NO_EMBED_LINK');
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
