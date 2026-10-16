'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const onboarding = require('../bin/lib/onboarding');
const { tmpTokensPath, cleanup, fakeFetch, neverFetch } = require('./helpers');

const BACKEND = 'https://pinch.example.test';
const INDEX = 'https://api.plow.co';
const PLOW_TOKEN = 'plow_agent_secret_do_not_log';

function registerRoutes({ assertion = 'plow_index_.assertion123', full = 'full_tok_aaa', readonly = 'ro_tok_bbb' } = {}) {
  return fakeFetch({
    '/v1/auth/index-identity': { json: { assertion } },
    '/api/pinch/register': { json: { full, readonly, account: { public_id: 'pub_123', display_name: 'Mary' } } },
  });
}

test('cache hit — a cached token pair skips registration entirely (no fetch)', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'cached_full', readonly: 'cached_ro' }, { tokensPath });
    const logs = [];
    const r = await onboarding.ensureRegistered({
      tokensPath,
      backendUrl: BACKEND,
      plowAgentToken: PLOW_TOKEN,
      fetchImpl: neverFetch(),
      logger: (m) => logs.push(m),
    });
    assert.equal(r.registered, false);
    assert.equal(r.rotated, false);
    assert.deepEqual(r.tokens, { full: 'cached_full', readonly: 'cached_ro' });
    assert.ok(logs.some((l) => /skipping registration/.test(l)));
  } finally {
    cleanup(dir);
  }
});

test('cache miss — mints an assertion, registers with X-Plow-Index-Assertion, persists mode 0600', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    const fetchImpl = registerRoutes({ full: 'full_tok_aaa', readonly: 'ro_tok_bbb' });
    const r = await onboarding.ensureRegistered({
      tokensPath,
      backendUrl: BACKEND,
      indexApiBase: INDEX,
      plowAgentToken: PLOW_TOKEN,
      fetchImpl,
    });

    assert.equal(r.registered, true);
    assert.deepEqual(r.tokens, { full: 'full_tok_aaa', readonly: 'ro_tok_bbb', account: { public_id: 'pub_123', display_name: 'Mary' } });

    // Mint call: GET index-identity with the Plow bearer.
    const mint = fetchImpl.calls.find((c) => c.url.includes('/v1/auth/index-identity'));
    assert.ok(mint, 'minted an assertion');
    assert.equal(mint.init.method, 'GET');
    assert.equal(mint.init.headers.Authorization, `Bearer ${PLOW_TOKEN}`);

    // Register call: POST with the CORRECTED assertion header, NOT Authorization.
    const reg = fetchImpl.calls.find((c) => c.url.includes('/api/pinch/register'));
    assert.ok(reg, 'called register');
    assert.equal(reg.init.method, 'POST');
    assert.equal(reg.init.headers['X-Plow-Index-Assertion'], 'plow_index_.assertion123');
    assert.equal(reg.init.headers.Authorization, undefined, 'assertion is NOT presented as a bearer');

    // Persisted to the volume, owner-only (0600), with both tokens.
    const onDisk = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    assert.equal(onDisk.full, 'full_tok_aaa');
    assert.equal(onDisk.readonly, 'ro_tok_bbb');
    const mode = fs.statSync(tokensPath).mode & 0o777;
    assert.equal(mode, 0o600, `expected mode 0600, got ${mode.toString(8)}`);
  } finally {
    cleanup(dir);
  }
});

test('rotate — re-registers even with a cached pair and overwrites the cache', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'old_full', readonly: 'old_ro' }, { tokensPath });
    const fetchImpl = registerRoutes({ full: 'new_full', readonly: 'new_ro' });
    const r = await onboarding.ensureRegistered({
      tokensPath,
      backendUrl: BACKEND,
      indexApiBase: INDEX,
      plowAgentToken: PLOW_TOKEN,
      rotate: true,
      fetchImpl,
    });

    assert.equal(r.registered, true);
    assert.equal(r.rotated, true);
    assert.equal(r.tokens.full, 'new_full');
    // Register body signals rotate.
    const reg = fetchImpl.calls.find((c) => c.url.includes('/api/pinch/register'));
    assert.deepEqual(JSON.parse(reg.init.body), { rotate: true });
    const onDisk = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    assert.equal(onDisk.full, 'new_full');
    assert.equal(onDisk.readonly, 'new_ro');
  } finally {
    cleanup(dir);
  }
});

test('register rejects the assertion (401) — surfaces ASSERTION_REJECTED, nothing cached', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    const fetchImpl = fakeFetch({
      '/v1/auth/index-identity': { json: { assertion: 'a' } },
      '/api/pinch/register': { ok: false, status: 401, text: '{"detail":"Invalid index identity assertion"}' },
    });
    await assert.rejects(
      onboarding.ensureRegistered({ tokensPath, backendUrl: BACKEND, indexApiBase: INDEX, plowAgentToken: PLOW_TOKEN, fetchImpl }),
      (e) => e.code === 'ASSERTION_REJECTED',
    );
    assert.equal(fs.existsSync(tokensPath), false, 'no token file written on failure');
  } finally {
    cleanup(dir);
  }
});

test('register rate-limited (429) — surfaces RATE_LIMITED', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    const fetchImpl = fakeFetch({
      '/v1/auth/index-identity': { json: { assertion: 'a' } },
      '/api/pinch/register': { ok: false, status: 429, text: 'slow down' },
    });
    await assert.rejects(
      onboarding.ensureRegistered({ tokensPath, backendUrl: BACKEND, indexApiBase: INDEX, plowAgentToken: PLOW_TOKEN, fetchImpl }),
      (e) => e.code === 'RATE_LIMITED',
    );
  } finally {
    cleanup(dir);
  }
});

test('no usable PLOW_AGENT_TOKEN — fails before any network call', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    await assert.rejects(
      onboarding.ensureRegistered({ tokensPath, backendUrl: BACKEND, plowAgentToken: 'proxied', fetchImpl: neverFetch() }),
      (e) => e.code === 'NO_PLOW_TOKEN',
    );
  } finally {
    cleanup(dir);
  }
});

test('secret hygiene — the logger never receives the Plow bearer or issued tokens', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    const fetchImpl = registerRoutes({ full: 'full_SECRET_aaa', readonly: 'ro_SECRET_bbb' });
    const logs = [];
    await onboarding.ensureRegistered({
      tokensPath,
      backendUrl: BACKEND,
      indexApiBase: INDEX,
      plowAgentToken: PLOW_TOKEN,
      fetchImpl,
      logger: (m) => logs.push(m),
    });
    const joined = logs.join('\n');
    assert.ok(!joined.includes(PLOW_TOKEN), 'Plow bearer must never be logged');
    assert.ok(!joined.includes('full_SECRET_aaa'), 'full token must never be logged');
    assert.ok(!joined.includes('ro_SECRET_bbb'), 'readonly token must never be logged');
  } finally {
    cleanup(dir);
  }
});

test('readCachedTokens — malformed/partial files resolve to null', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    fs.writeFileSync(tokensPath, 'not json{');
    assert.equal(onboarding.readCachedTokens({ tokensPath }), null);
    fs.writeFileSync(tokensPath, JSON.stringify({ readonly: 'ro_only' }));
    assert.equal(onboarding.readCachedTokens({ tokensPath }), null, 'a pair without a full token is unusable');
    fs.writeFileSync(tokensPath, JSON.stringify({ full: 'f' }));
    assert.deepEqual(onboarding.readCachedTokens({ tokensPath }), { full: 'f', readonly: null });
  } finally {
    cleanup(dir);
  }
});
