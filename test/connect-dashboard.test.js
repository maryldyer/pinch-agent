'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const onboarding = require('../bin/lib/onboarding');
const { tmpTokensPath, cleanup, fakeFetch } = require('./helpers');

const BACKEND = 'https://pinch.example.test';

test('connectDashboard — relays the backend read-write {embedUrl, token} (rotated)', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    // The cache still carries an old readonly from registration; it must NOT be used.
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'old_cached_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': {
        json: { embedUrl: `${BACKEND}/embed?token=fresh_rw`, token: 'fresh_rw' },
      },
    });
    const r = await onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl });
    assert.equal(r.source, 'rotated');
    assert.equal(r.token, 'fresh_rw');
    // Relays the backend's own embedUrl verbatim (carries the full read-write token).
    assert.equal(r.embedUrl, `${BACKEND}/embed?token=fresh_rw`);
    // No readonly field handed back anymore.
    assert.equal(r.readonly, undefined);
    // Authed with the account FULL token.
    const call = fetchImpl.calls.find((c) => c.url.includes('/api/pinch/connect-dashboard'));
    assert.equal(call.init.headers.Authorization, 'Bearer full_tok');
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — builds the embed URL from the token when the endpoint omits embedUrl', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: null }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { json: { token: 'fresh_rw' } },
    });
    const r = await onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl });
    assert.equal(r.source, 'rotated');
    assert.equal(r.token, 'fresh_rw');
    assert.equal(r.embedUrl, `${BACKEND}/embed?token=fresh_rw`);
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — endpoint 404 THROWS, never falls back to a stale readonly link', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    // A cached readonly is present; the fix must refuse to hand it out (that was
    // the exact "library loads but can't add groceries" failure).
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'stale_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { ok: false, status: 404, text: 'not found' },
    });
    await assert.rejects(
      onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl }),
      (e) => e.code === 'CONNECT_FAILED',
    );
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — endpoint unreachable THROWS (no silent fallback)', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'stale_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': new Error('ECONNREFUSED'),
    });
    await assert.rejects(
      onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl }),
      (e) => e.code === 'CONNECT_UNREACHABLE',
    );
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — 200 with no embedUrl and no token THROWS NO_EMBED_LINK', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'stale_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { json: {} },
    });
    await assert.rejects(
      onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl }),
      (e) => e.code === 'NO_EMBED_LINK',
    );
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — no account token at all THROWS NO_FULL_TOKEN', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  const savedEnv = process.env.PINCH_API_TOKEN;
  delete process.env.PINCH_API_TOKEN;
  try {
    // No cache file written → no full token, and no env fallback.
    const fetchImpl = fakeFetch({});
    await assert.rejects(
      onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl }),
      (e) => e.code === 'NO_FULL_TOKEN',
    );
  } finally {
    if (savedEnv !== undefined) process.env.PINCH_API_TOKEN = savedEnv;
    cleanup(dir);
  }
});
