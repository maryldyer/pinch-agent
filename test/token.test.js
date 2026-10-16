'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const onboarding = require('../bin/lib/onboarding');
const { resolveFullToken, resolveReadonlyToken } = require('../bin/lib/pinch-token');
const { tmpTokensPath, cleanup } = require('./helpers');

test('resolveFullToken — cached full wins over the env fallback', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  const prev = process.env.PINCH_API_TOKEN;
  try {
    process.env.PINCH_API_TOKEN = 'env_fallback_full';
    onboarding.writeCachedTokens({ full: 'cached_full', readonly: 'cached_ro' }, { tokensPath });
    assert.equal(resolveFullToken({ tokensPath }), 'cached_full');
  } finally {
    if (prev === undefined) delete process.env.PINCH_API_TOKEN; else process.env.PINCH_API_TOKEN = prev;
    cleanup(dir);
  }
});

test('resolveFullToken — falls back to PINCH_API_TOKEN when no cache', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  const prev = process.env.PINCH_API_TOKEN;
  try {
    process.env.PINCH_API_TOKEN = 'env_fallback_full';
    assert.equal(resolveFullToken({ tokensPath }), 'env_fallback_full');
  } finally {
    if (prev === undefined) delete process.env.PINCH_API_TOKEN; else process.env.PINCH_API_TOKEN = prev;
    cleanup(dir);
  }
});

test('resolveReadonlyToken — cached readonly wins, else PINCH_READONLY_TOKEN', async () => {
  const { dir, tokensPath } = tmpTokensPath();
  const prev = process.env.PINCH_READONLY_TOKEN;
  try {
    process.env.PINCH_READONLY_TOKEN = 'env_ro';
    onboarding.writeCachedTokens({ full: 'f', readonly: 'cached_ro' }, { tokensPath });
    assert.equal(resolveReadonlyToken({ tokensPath }), 'cached_ro');

    // A cache with no readonly falls through to the env.
    onboarding.writeCachedTokens({ full: 'f', readonly: null }, { tokensPath });
    assert.equal(resolveReadonlyToken({ tokensPath }), 'env_ro');
  } finally {
    if (prev === undefined) delete process.env.PINCH_READONLY_TOKEN; else process.env.PINCH_READONLY_TOKEN = prev;
    cleanup(dir);
  }
});
