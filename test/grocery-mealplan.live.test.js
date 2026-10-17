'use strict';
// Chunk 8 live tests — run the grocery + meal-plan bin helpers against a REAL,
// locally-run grocery-mealplan backend and prove two things:
//   1. the helpers drive the endpoints correctly (create list, add-from-recipe
//      consolidating server-side, manual add, plan set/read, generate);
//   2. the single-engine gate (§6/§9): the SAME recipe set run through the web
//      path (the from-recipe API called directly, as the web app does) and
//      through the agent-helper path yields IDENTICAL consolidated items — same
//      totals, same sources — i.e. the agent reuses the one server-side engine,
//      never a divergent local one.
//
// Skipped unless PINCH_BACKEND_URL + PINCH_API_TOKEN are set (point them at a
// local `npm run server`). Run:
//   PINCH_BACKEND_URL=http://localhost:8799 PINCH_API_TOKEN=... node --test test/grocery-mealplan.live.test.js
const assert = require('node:assert');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const BASE = (process.env.PINCH_BACKEND_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.PINCH_API_TOKEN || '';
const SKIP = !BASE || !TOKEN;
const BIN = path.join(__dirname, '..', 'bin');
const ENV = { ...process.env };

/** Run a bin helper; return { stdout, stderr }. Throws (with stderr) on failure. */
function helper(name, args = [], input) {
  const stdout = execFileSync(path.join(BIN, name), args, {
    env: ENV,
    input: input ?? undefined,
    encoding: 'utf8',
  });
  return stdout;
}

/** Direct API call (the "web path"); mirrors what the web app's fetch does. */
async function web(method, p, body) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${p}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

/** Strip the volatile bits (ids, order, listId) so two lists built by different
 * paths compare on their CONSOLIDATION, not their row identity. */
function canonical(items) {
  return items
    .map((it) => ({
      normalizedName: it.normalizedName,
      text: it.text,
      quantity: it.quantity,
      unit: it.unit,
      aisle: it.aisle,
      checked: it.checked,
      sources: it.sources
        .map((s) => ({ origin: s.origin, recipeId: s.recipeId, recipeTitle: s.recipeTitle, quantity: s.quantity, unit: s.unit }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }))
    .sort((a, b) => `${a.normalizedName} ${a.unit}`.localeCompare(`${b.normalizedName} ${b.unit}`));
}

const RECIPES = [
  { id: 'live-shakshuka', title: 'Shakshuka', ingredientLines: ['6 eggs', '1 onion', '2 cups crushed tomatoes', '1 tsp salt'] },
  { id: 'live-banana', title: 'Banana Bread', ingredientLines: ['3 bananas', '2 cups flour', '1 onion', '1 tsp salt'] },
];

function fullRecipe(r) {
  return {
    id: r.id, title: r.title, photoUrl: null, categories: [],
    ingredients: r.ingredientLines.join('\n'), ingredientLines: r.ingredientLines,
    directions: '', steps: [], prepTime: null, cookTime: null, totalTime: null, servings: null,
    source: null, sourceUrl: null, notes: null, rating: null, hash: `h-${r.id}`,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', lastCookedAt: null,
  };
}

test('helpers drive the grocery + meal-plan endpoints against a live backend', { skip: SKIP }, async () => {
  for (const r of RECIPES) await web('POST', '/api/pinch/recipes', fullRecipe(r));

  // create a list, add two recipes → server consolidates (onion ×2, salt ×2).
  const listId = JSON.parse(helper('pinch-lists', ['--create', 'Helper Smoke'])).id;
  helper('pinch-add-recipe', [listId, '--id', 'live-shakshuka']);
  helper('pinch-add-recipe', [listId, '--id', 'live-banana']);
  const items = JSON.parse(helper('pinch-list-items', [listId, '--json']));
  const onion = items.find((i) => i.normalizedName === 'onion');
  assert.strictEqual(onion.quantity, 2, 'onion consolidated to 2 across both recipes');
  assert.strictEqual(onion.sources.length, 2, 'onion keeps a source per recipe');

  // manual add is a manual-origin source (explicit --list).
  helper('pinch-add-item', ['2 lemons', '--list', listId]);
  const lemon = JSON.parse(helper('pinch-list-items', [listId, '--json'])).find((i) => i.normalizedName === 'lemon');
  assert.strictEqual(lemon.sources[0].origin, 'manual');

  // M3: no --list defaults to the "This Week" (default) list; the backend
  // auto-materializes default on add, so this lands even on a fresh account.
  helper('pinch-add-item', ['1 loaf sourdough']);
  const onDefault = JSON.parse(helper('pinch-list-items', ['default', '--json']));
  assert.ok(onDefault.some((i) => i.text.includes('sourdough')), 'default-list fallback landed the item on "This Week"');

  // meal plan: set an entry, read it back, generate.
  helper('pinch-plan-set', ['2030-01-02', 'dinner', 'live-shakshuka', '--week', '2029-12-31']);
  const plan = JSON.parse(helper('pinch-plan', ['--week', '2029-12-31', '--json']));
  assert.strictEqual(plan.entries.length, 1);
  assert.strictEqual(plan.entries[0].recipeId, 'live-shakshuka');
  const genListId = JSON.parse(helper('pinch-lists', ['--create', 'Plan Target'])).id;
  helper('pinch-generate', ['--week', '2029-12-31', '--list', genListId]);
  const genItems = JSON.parse(helper('pinch-list-items', [genListId, '--json']));
  const genEgg = genItems.find((i) => i.normalizedName === 'egg');
  assert.strictEqual(genEgg.quantity, 6);
  assert.strictEqual(genEgg.sources[0].origin, 'plan');
});

test('single-engine gate: web path and agent-helper path yield IDENTICAL consolidated items', { skip: SKIP }, async () => {
  for (const r of RECIPES) await web('POST', '/api/pinch/recipes', fullRecipe(r));

  // WEB PATH: call the from-recipe API directly, exactly as the web app does.
  const webList = (await web('POST', '/api/pinch/lists', { name: 'web-path' })).list.id;
  for (const r of RECIPES) {
    await web('POST', `/api/pinch/lists/${webList}/items/from-recipe`, {
      recipeId: r.id, recipeTitle: r.title, ingredientLines: r.ingredientLines,
    });
  }
  const webItems = (await web('GET', `/api/pinch/lists/${webList}/items`)).items;

  // AGENT PATH: the same recipes via the bin helper.
  const agentList = JSON.parse(helper('pinch-lists', ['--create', 'agent-path'])).id;
  for (const r of RECIPES) helper('pinch-add-recipe', [agentList, '--id', r.id]);
  const agentItems = JSON.parse(helper('pinch-list-items', [agentList, '--json']));

  // The consolidation (totals + sources) must be byte-for-byte identical — the
  // only differences allowed are row ids / order, which canonical() strips.
  assert.deepStrictEqual(canonical(agentItems), canonical(webItems));
});

test('single-engine gate (stdin path): a piped staple-trimmed recipe consolidates EXACTLY the kept lines', { skip: SKIP }, async () => {
  // The agent drops staples by LLM judgment and PIPES the trimmed recipe JSON to
  // pinch-add-recipe (no --id). This gate catches any future regression that
  // sneaks local filtering/aggregation into the stdin path: the server must
  // consolidate exactly the lines it was sent — identical to posting them via the
  // web from-recipe API — with the staples the agent dropped simply absent.
  const recipe = {
    id: 'stdin-shak',
    title: 'Shakshuka',
    ingredientLines: ['6 eggs', '1 onion', '2 cups crushed tomatoes', '1 tsp salt', '1 tsp pepper'],
  };
  await web('POST', '/api/pinch/recipes', fullRecipe(recipe));
  const kept = ['6 eggs', '1 onion', '2 cups crushed tomatoes']; // agent dropped salt + pepper

  // AGENT stdin path: pipe the trimmed recipe JSON on stdin.
  const agentList = JSON.parse(helper('pinch-lists', ['--create', 'stdin-agent'])).id;
  helper('pinch-add-recipe', [agentList], JSON.stringify({ id: recipe.id, title: recipe.title, ingredientLines: kept }));
  const agentItems = JSON.parse(helper('pinch-list-items', [agentList, '--json']));

  // WEB path: post the SAME kept lines directly.
  const webList = (await web('POST', '/api/pinch/lists', { name: 'stdin-web' })).list.id;
  await web('POST', `/api/pinch/lists/${webList}/items/from-recipe`, {
    recipeId: recipe.id, recipeTitle: recipe.title, ingredientLines: kept,
  });
  const webItems = (await web('GET', `/api/pinch/lists/${webList}/items`)).items;

  // Identical to the web path → the stdin path ran the SAME server engine.
  assert.deepStrictEqual(canonical(agentItems), canonical(webItems));
  // Exactly the 3 kept lines (no local aggregation added/merged anything extra)…
  assert.strictEqual(agentItems.length, 3);
  // …the dropped staples are absent, and every source is origin='recipe'.
  assert.ok(!agentItems.some((i) => /salt|pepper/.test(i.normalizedName)), 'dropped staples absent');
  assert.ok(agentItems.every((i) => i.sources.every((s) => s.origin === 'recipe')), 'all sources origin=recipe');
});
