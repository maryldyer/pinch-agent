'use strict';
// pinch-prefs lib — the §4.3 gap-check + the §4.1 upsert, exercised against a
// STUB backend (fakeFetch), so the helper's call-shape is proven without a live
// prod (the Chunk-2 endpoints are built but not yet deployed). Covers: the right
// method/path/query/body/Authorization, the ≤2 drip cap, that only unknown keys
// are surfaced to ask, and local enum validation.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { gapCheck, readPreferences, getDriverDefault, setDriverDefault, upsertPreference } = require('../bin/lib/prefs');
const { fakeFetch } = require('./helpers');

const BACKEND = 'https://pinch.example.test';
const TOKEN = 'full_tok';
const ctx = (fetchImpl) => ({ backendUrl: BACKEND, token: TOKEN, fetchImpl });

test('gapCheck — sends every DISTINCT key as a formKey param, authed with the FULL bearer', async () => {
  const fetchImpl = fakeFetch({
    '/api/pinch/preferences/unknown': { json: { unknown: ['eggs', 'olive oil'] } },
  });
  const out = await gapCheck(ctx(fetchImpl), ['crushed tomato', 'eggs', 'olive oil', 'eggs']);
  assert.deepEqual(out, { unknown: ['eggs', 'olive oil'] });

  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  const url = new URL(call.url);
  // De-duplicated ("eggs" once), each key encoded (space → %20) in a formKey param.
  assert.deepEqual(url.searchParams.getAll('formKey'), ['crushed tomato', 'eggs', 'olive oil']);
  assert.ok(call.url.includes('olive%20oil'));
});

test('gapCheck — returns ONLY the backend-reported unknowns (known keys are skipped)', async () => {
  // Ask about 3 keys; the backend says only two lack a pref → those are returned.
  const fetchImpl = fakeFetch({
    '/preferences/unknown': { json: { unknown: ['eggs', 'olive oil'] } },
  });
  const out = await gapCheck(ctx(fetchImpl), ['crushed tomato', 'eggs', 'olive oil']);
  assert.deepEqual(out.unknown, ['eggs', 'olive oil']); // 'crushed tomato' (known) absent
});

test('gapCheck — --max caps the drip to ≤N (the ≤2 rule, §4.3)', async () => {
  const fetchImpl = fakeFetch({
    '/preferences/unknown': { json: { unknown: ['a', 'b', 'c', 'd'] } },
  });
  const out = await gapCheck(ctx(fetchImpl), ['a', 'b', 'c', 'd'], { max: 2 });
  assert.deepEqual(out.unknown, ['a', 'b']); // first two only
});

test('gapCheck — empty key set makes no request', async () => {
  const fetchImpl = fakeFetch({ '/x': { json: {} } });
  const out = await gapCheck(ctx(fetchImpl), []);
  assert.deepEqual(out, { unknown: [] });
  assert.equal(fetchImpl.calls.length, 0);
});

test('readPreferences — GETs distinct formKey params, authed, returns the stored rows (order-time)', async () => {
  const rows = [{ formKey: 'crushed tomato', brand: 'San Marzano', organic: 'yes', driverOverride: 'brand', source: 'this_or_that' }];
  const fetchImpl = fakeFetch({ '/api/pinch/preferences?': { json: { preferences: rows } } });
  const out = await readPreferences(ctx(fetchImpl), ['crushed tomato', 'egg', 'crushed tomato']);
  assert.deepEqual(out, { preferences: rows });

  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'GET');
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  const url = new URL(call.url);
  assert.deepEqual(url.searchParams.getAll('formKey'), ['crushed tomato', 'egg']); // de-duped
});

test('readPreferences — empty key set makes no request', async () => {
  const fetchImpl = fakeFetch({ '/x': { json: {} } });
  assert.deepEqual(await readPreferences(ctx(fetchImpl), []), { preferences: [] });
  assert.equal(fetchImpl.calls.length, 0);
});

test('getDriverDefault — GETs /driver authed; coerces anything but price|brand to null', async () => {
  const brandFetch = fakeFetch({ '/api/pinch/preferences/driver': { json: { driver: 'brand' } } });
  assert.deepEqual(await getDriverDefault(ctx(brandFetch)), { driver: 'brand' });
  assert.equal(brandFetch.calls[0].init.method, 'GET');
  assert.equal(brandFetch.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);

  const nullFetch = fakeFetch({ '/preferences/driver': { json: { driver: null } } });
  assert.deepEqual(await getDriverDefault(ctx(nullFetch)), { driver: null });
  const junkFetch = fakeFetch({ '/preferences/driver': { json: { driver: 'cheapest' } } });
  assert.deepEqual(await getDriverDefault(ctx(junkFetch)), { driver: null });
});

test('setDriverDefault — PUTs { driver } to /driver, authed, returns the stored lean', async () => {
  const fetchImpl = fakeFetch({ '/api/pinch/preferences/driver': { json: { driver: 'brand' } } });
  const out = await setDriverDefault(ctx(fetchImpl), 'brand');
  assert.deepEqual(out, { driver: 'brand' });

  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'PUT');
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.init.body), { driver: 'brand' });
});

test('setDriverDefault — null clears the lean (PUT { driver: null })', async () => {
  const fetchImpl = fakeFetch({ '/api/pinch/preferences/driver': { json: { driver: null } } });
  const out = await setDriverDefault(ctx(fetchImpl), null);
  assert.deepEqual(out, { driver: null });
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), { driver: null });
});

test('setDriverDefault — rejects a bad enum locally before any request', async () => {
  const fetchImpl = fakeFetch({ '/x': { json: {} } });
  await assert.rejects(() => setDriverDefault(ctx(fetchImpl), 'cheapest'), /driver must be one of/);
  assert.equal(fetchImpl.calls.length, 0);
});

test('upsertPreference — PUTs the full body to /preferences, authed, returns { preference }', async () => {
  const saved = {
    formKey: 'crushed tomato',
    brand: 'San Marzano',
    organic: 'yes',
    driverOverride: 'brand',
    source: 'this_or_that',
    updatedAt: '2026-11-02T00:00:00.000Z',
  };
  const fetchImpl = fakeFetch({ '/api/pinch/preferences': { json: { preference: saved } } });
  const out = await upsertPreference(ctx(fetchImpl), {
    formKey: 'crushed tomato',
    brand: 'San Marzano',
    organic: 'yes',
    driverOverride: 'brand',
    source: 'this_or_that',
  });
  assert.deepEqual(out, { preference: saved });

  const call = fetchImpl.calls[0];
  assert.equal(call.init.method, 'PUT');
  assert.equal(call.init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(call.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(call.init.body), {
    formKey: 'crushed tomato',
    source: 'this_or_that',
    brand: 'San Marzano',
    organic: 'yes',
    driverOverride: 'brand',
  });
});

test('upsertPreference — a post_delivery correction PUTs source=post_delivery (outranks BIA, §4.5/§4.6)', async () => {
  const fetchImpl = fakeFetch({ '/api/pinch/preferences': { json: { preference: {} } } });
  await upsertPreference(ctx(fetchImpl), {
    formKey: 'crushed tomato',
    brand: 'San Marzano',
    organic: 'yes',
    source: 'post_delivery',
  });
  assert.equal(fetchImpl.calls[0].init.method, 'PUT');
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
    formKey: 'crushed tomato',
    source: 'post_delivery',
    brand: 'San Marzano',
    organic: 'yes',
  });
});

test('upsertPreference — a this_or_that answer with only a brand omits the optional fields', async () => {
  const fetchImpl = fakeFetch({ '/api/pinch/preferences': { json: { preference: {} } } });
  await upsertPreference(ctx(fetchImpl), { formKey: 'egg', brand: 'Vital Farms', source: 'this_or_that' });
  assert.deepEqual(JSON.parse(fetchImpl.calls[0].init.body), {
    formKey: 'egg',
    source: 'this_or_that',
    brand: 'Vital Farms',
  });
});

test('upsertPreference — rejects a bad enum locally before any request', async () => {
  const fetchImpl = fakeFetch({ '/x': { json: {} } });
  await assert.rejects(
    () => upsertPreference(ctx(fetchImpl), { formKey: 'x', source: 'guessing' }),
    /source must be one of/,
  );
  await assert.rejects(
    () => upsertPreference(ctx(fetchImpl), { formKey: 'x', source: 'this_or_that', organic: 'maybe' }),
    /organic must be one of/,
  );
  await assert.rejects(
    () => upsertPreference(ctx(fetchImpl), { formKey: '', source: 'this_or_that' }),
    /formKey is required/,
  );
  assert.equal(fetchImpl.calls.length, 0); // nothing hit the network
});

test('gapCheck — a 401 surfaces as an auth error (status preserved)', async () => {
  const fetchImpl = fakeFetch({
    '/preferences/unknown': { ok: false, status: 401, text: 'nope' },
  });
  await assert.rejects(() => gapCheck(ctx(fetchImpl), ['x']), (e) => e.status === 401);
});
