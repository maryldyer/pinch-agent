'use strict';
// pinch-prefs CLI — the `upsert --derive` path: a raw product phrase must be keyed
// through deriveFormKey BEFORE it becomes the request body, so a post-delivery (or
// this-or-that) correction lands on the SAME key order-time reads. The derive step
// lives in the CLI wrapper (not the prefs lib), so this exercises the real binary
// against a local stub HTTP server.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { deriveFormKey } = require('../bin/lib/form-key');

const BIN = path.join(__dirname, '..', 'bin', 'pinch-prefs');

// Async spawn (NOT spawnSync): the stub HTTP server shares this process's event
// loop, so a synchronous child wait would deadlock it. Resolve on child close.
function runCli(args, env) {
  return new Promise((resolve) => {
    const child = spawn('node', [BIN, ...args], { env, encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function startStub() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      calls.push({ method: req.method, url: req.url, auth: req.headers['authorization'], body });
      res.setHeader('content-type', 'application/json');
      // Echo the written pref back, as the real endpoint does.
      const b = body ? JSON.parse(body) : {};
      res.end(JSON.stringify({ preference: { brand: null, organic: 'no_preference', driverOverride: null, ...b } }));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, calls }));
  });
}

test('pinch-prefs upsert --derive keys the raw phrase through deriveFormKey before the PUT body', async () => {
  const { server, port, calls } = await startStub();
  // Empty state dir → no cached token → falls back to PINCH_API_TOKEN.
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinch-cli-'));
  try {
    const phrase = 'San Marzano crushed canned tomatoes';
    const run = await runCli(
      ['upsert', '--form-key', phrase, '--derive', '--no-brand', '--organic', 'yes', '--source', 'post_delivery'],
      { ...process.env, PINCH_STATE_DIR: stateDir, PINCH_BACKEND_URL: `http://127.0.0.1:${port}`, PINCH_API_TOKEN: 'stub-tok' },
    );

    assert.equal(run.status, 0, `exit 0 (stderr: ${run.stderr})`);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.method, 'PUT');
    assert.equal(call.url, '/api/pinch/preferences');
    assert.equal(call.auth, 'Bearer stub-tok');
    // The body's formKey is the DERIVED key, not the raw phrase.
    const sent = JSON.parse(call.body);
    assert.equal(sent.formKey, deriveFormKey(phrase)); // 'crushed tomato'
    assert.equal(sent.formKey, 'crushed tomato');
    assert.notEqual(sent.formKey, phrase);
    assert.equal(sent.source, 'post_delivery');
    assert.equal(sent.brand, null); // --no-brand
    assert.equal(sent.organic, 'yes');
  } finally {
    server.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('pinch-prefs upsert --derive on a phrase that derives empty → exit 2, no request', async () => {
  const { server, port, calls } = await startStub();
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinch-cli-'));
  try {
    const run = await runCli(['upsert', '--form-key', '2 28oz', '--derive', '--source', 'this_or_that'], {
      ...process.env, PINCH_STATE_DIR: stateDir, PINCH_BACKEND_URL: `http://127.0.0.1:${port}`, PINCH_API_TOKEN: 'stub-tok',
    });
    assert.equal(run.status, 2, `exit 2 on empty derived key (stderr: ${run.stderr})`);
    assert.equal(calls.length, 0); // never hit the network
  } finally {
    server.close();
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
