'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const onboarding = require('../bin/lib/onboarding');
const { tmpTokensPath, cleanup, fakeFetch } = require('./helpers');

const BACKEND = 'https://pinch.example.test';

test('connectDashboard — rotates a fresh readonly via the endpoint when live', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'old_cached_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { json: { readonly: 'fresh_rotated_ro' } },
    });
    const r = await onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl });
    assert.equal(r.source, 'rotated');
    assert.equal(r.readonly, 'fresh_rotated_ro');
    assert.equal(r.embedUrl, `${BACKEND}/embed?token=fresh_rotated_ro`);
    // Authed with the account FULL token.
    const call = fetchImpl.calls.find((c) => c.url.includes('/api/pinch/connect-dashboard'));
    assert.equal(call.init.headers.Authorization, 'Bearer full_tok');
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — endpoint not live (404) falls back to the cached readonly', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'cached_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { ok: false, status: 404, text: 'not found' },
    });
    const r = await onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl });
    assert.equal(r.source, 'cached');
    assert.equal(r.readonly, 'cached_ro');
    assert.equal(r.embedUrl, `${BACKEND}/embed?token=cached_ro`);
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — endpoint unreachable falls back to the cached readonly', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: 'cached_ro' }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': new Error('ECONNREFUSED'),
    });
    const r = await onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl });
    assert.equal(r.source, 'cached');
    assert.equal(r.readonly, 'cached_ro');
  } finally {
    cleanup(dir);
  }
});

test('connectDashboard — no endpoint and no cached readonly throws NO_READONLY', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  try {
    onboarding.writeCachedTokens({ full: 'full_tok', readonly: null }, { tokensPath });
    const fetchImpl = fakeFetch({
      '/api/pinch/connect-dashboard': { ok: false, status: 404, text: 'nope' },
    });
    await assert.rejects(
      onboarding.connectDashboard({ tokensPath, backendUrl: BACKEND, fetchImpl }),
      (e) => e.code === 'NO_READONLY',
    );
  } finally {
    cleanup(dir);
  }
});
