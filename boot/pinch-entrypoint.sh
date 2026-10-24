#!/usr/bin/env bash
# Pinch variant entrypoint. Wraps the inherited Plow boot so the usage reporter
# and Plow-owned config rendering are untouched; it only layers Pinch's required
# image-capable model default on top.
#
# Why a wrapper: the base seeds `agents.defaults.model` with the text-only primary
# `plow/z-ai/glm-5.2` and exposes no build-time/env hook to change it. Pinch needs
# an image-capable primary (`plow/anthropic/claude-sonnet-5`, which the base's own
# model catalog declares image-capable) so a texted recipe photo can be read.
#
# How — two layers, with NO restart/supervision dependency (the managed exe.dev
# runtime does not restart an agent that exits on its own, so a self-restart would
# risk leaving a fresh 1-click agent down):
#
#   1. PRE-SEED (the fix; works identically on managed + local). On a FRESH volume
#      we write `/var/lib/plow/openclaw.json` BEFORE launching boot, with
#      `agents.defaults.model` already set to sonnet. That field is NON-OWNED: the
#      base boot's `syncConfig` refreshes only its own `$include`-owned paths and
#      PRESERVES non-owned fields already present in the file (verified against the
#      base config.js). So the gateway reads sonnet at startup and the very first
#      message — even a photo — is image-capable, with no reload and no restart.
#      The pre-seed also carries the base's OTHER non-owned defaults (workspace,
#      skipBootstrap, sandbox, skills dirs, mcp idle ttl) because syncConfig only
#      auto-populates those on the no-file path — a model-only pre-seed would drop
#      them (skills would stop loading, bootstrap would re-run). Written ONLY if
#      the file is absent, so a warm/existing volume is never touched.
#   2. CONFIG SET (warm/legacy persistence). In the background we still apply the
#      override via the base's documented `openclaw config set`, so a pre-existing
#      volume that predates the pre-seed converges to sonnet on its next natural
#      restart. `reload.mode` is off, so this does not change the already-running
#      gateway; on a fresh/already-sonnet volume it is a harmless no-op.
#
# Both layers are best-effort and never block or fail the agent — a texting agent
# must still boot even if neither can be applied.
set -euo pipefail

PINCH_MODEL_JSON='{"primary":"plow/anthropic/claude-sonnet-5","fallbacks":["plow/z-ai/glm-5.2"]}'
PINCH_CONFIG_PATH=/var/lib/plow/openclaw.json

# Pre-seed the image-capable primary into the persisted config BEFORE boot renders
# it, but ONLY on a fresh volume (absent file). `syncConfig` preserves this
# non-owned field and refreshes its owned `$include` paths around it, so the
# gateway starts on sonnet with no restart. We replicate the base's other
# non-owned defaults here (workspace / skipBootstrap / sandbox / modelPolicy /
# per-model `models` params / skills dirs / mcp idle ttl) because syncConfig only
# auto-fills those when the file is absent — omitting any would drop it (skills
# would stop loading, bootstrap would re-run, glm fallback would lose its
# reasoning-disabled params). These mirror the PINNED base's fresh render exactly,
# with ONLY model.primary overridden to sonnet.
#
# ⚠️  This non-owned set is pinned to the base digest in the Dockerfile. On ANY base
# digest bump, RE-VERIFY it: re-run the drift check (pinned base `syncConfig` over
# the fresh no-file path vs this pre-seed) and confirm the non-owned residue is
# identical except the intended sonnet override — a base that adds/changes a
# non-owned `agents.defaults` field would otherwise be silently dropped here.
# Best-effort; never fails the agent.
preseed_model_config() {
  [ -e "$PINCH_CONFIG_PATH" ] && return 0            # warm/existing volume — leave it
  mkdir -p /var/lib/plow 2>/dev/null || true
  # Write to a temp file, then atomically rename into place (mirrors the base
  # syncConfig's tmp+rename). A partial/failed write (ENOSPC, interrupt) leaves the
  # real path ABSENT rather than a corrupt 0-byte file — so base boot falls back to
  # the full seed via ENOENT instead of THROWING on parse (which would park the
  # agent, the exact down-on-managed failure this rework avoids).
  tmp="$PINCH_CONFIG_PATH.tmp"
  if cat > "$tmp" 2>/dev/null <<'JSON'
{
  "meta": {},
  "agents": {
    "defaults": {
      "workspace": "/var/lib/plow/workspace",
      "skipBootstrap": true,
      "model": { "primary": "plow/anthropic/claude-sonnet-5", "fallbacks": ["plow/z-ai/glm-5.2"] },
      "sandbox": { "mode": "off" },
      "modelPolicy": {},
      "models": { "plow/z-ai/glm-5.2": { "params": { "extraBody": { "reasoning": { "enabled": false } } } } }
    }
  },
  "mcp": { "sessionIdleTtlMs": 300000 },
  "skills": {
    "load": { "extraDirs": ["/opt/plow/skills"] },
    "allowBundled": ["plow-no-bundled-skills"]
  }
}
JSON
  then
    chmod 0600 "$tmp" 2>/dev/null || true
    if mv -f "$tmp" "$PINCH_CONFIG_PATH" 2>/dev/null; then
      echo "[pinch] first boot (fresh volume): pre-seeded image-capable primary (claude-sonnet-5) so the first message works without a restart"
    else
      rm -f "$tmp" 2>/dev/null || true
      echo "[pinch] WARN: could not install pre-seeded model config; relying on background config set" >&2
    fi
  else
    rm -f "$tmp" 2>/dev/null || true
    echo "[pinch] WARN: could not pre-seed model config; relying on background config set" >&2
  fi
  return 0
}

apply_model_override() {
  # Warm/legacy persistence only: apply the override through the base's documented
  # `openclaw config set` so a volume that predates the pre-seed converges to sonnet
  # on its next natural restart. `reload.mode` is off, so this does NOT change the
  # running gateway — the pre-seed above is what makes THIS boot image-capable. On a
  # fresh/already-sonnet volume this is a no-op. Best-effort; never fails the agent.
  for _ in $(seq 1 60); do
    if [ -r /var/lib/plow/gateway-password ]; then
      OPENCLAW_GATEWAY_PASSWORD="$(cat /var/lib/plow/gateway-password)"
      export OPENCLAW_GATEWAY_PASSWORD
      export OPENCLAW_STATE_DIR=/var/lib/plow
      export OPENCLAW_CONFIG_PATH=/var/lib/plow/openclaw.json
      if openclaw config set agents.defaults.model "$PINCH_MODEL_JSON" >/dev/null 2>&1; then
        echo "[pinch] primary model persisted as anthropic/claude-sonnet-5 (image-capable)"
        return 0
      fi
    fi
    sleep 2
  done
  echo "[pinch] WARN: could not apply model override; base default remains active" >&2
  return 0
}

# Pre-seed synchronously BEFORE boot renders the config, then the background
# config-set covers warm/legacy volumes.
preseed_model_config || true
apply_model_override &

# Self-register this agent's account on first boot (spec §5 / Chunk 5).
# REGISTER ONCE, THEN CACHE: a normal reboot finds the cached { full, readonly }
# token pair on the state volume and skips registration entirely (no assertion
# minted, no /register call). Only a first-ever boot (or a wiped volume) mints a
# Plow Index Identity assertion and calls the backend.
#
# Best-effort and bounded: the backend /register endpoint may not be live yet
# (Chunks 5/8 deferred), so this NEVER blocks or fails the agent — the backend
# helpers fall back to PINCH_API_TOKEN until the token pair is cached. A truthful
# non-zero exit from pinch-register just drives a few bounded retries here (for a
# transient backend hiccup on a genuine first boot); a cache hit returns 0
# immediately on the first attempt.
self_register() {
  for _ in 1 2 3; do
    if node /opt/plow/pinch-bin/pinch-register >/dev/null 2>&1; then
      return 0
    fi
    sleep 5
  done
  echo "[pinch] WARN: self-registration did not complete; using PINCH_API_TOKEN fallback" >&2
  return 0
}

self_register &

# Seed Pinch's long-term memory into the workspace. MEMORY.md is the base's
# long-term-memory file — it auto-loads in DM/iMessage sessions and is searchable
# via the memory tools — but the base boot renders AGENTS.md and never manages
# MEMORY.md. So we bake MEMORY.md into the image and place it in the workspace
# here, BEFORE launching boot (main.js only ever rm's BOOTSTRAP/SOUL/IDENTITY/
# USER.md and rewrites AGENTS.md, never MEMORY.md). Seeded only if absent, so a
# volume whose memory has grown at runtime is never clobbered; a fresh-volume
# relaunch re-seeds from the baked copy, keeping the facts durable + reproducible.
seed_memory() {
  mkdir -p /var/lib/plow/workspace 2>/dev/null || true
  if [ ! -f /var/lib/plow/workspace/MEMORY.md ] && [ -r /opt/plow/prompt/MEMORY.md ]; then
    if cp /opt/plow/prompt/MEMORY.md /var/lib/plow/workspace/MEMORY.md 2>/dev/null; then
      echo "[pinch] seeded long-term memory (MEMORY.md)"
    fi
  fi
}
seed_memory || true

# Seed the AIWU "use case" stories (the listing's rolling "tasks this agent
# completed" feed) ONCE per state volume. Stories post with THIS install's own
# report-only key (minted by the base's Index client during boot), never the
# Plow account token; pinch-publish-story wraps agent-index-client.py --story and
# the key never leaves that client. The three seeds are REAL Pinch capabilities,
# anonymized (no owner PII — stories are PUBLIC). Their stable ids match the
# auto-story skill's per-task-type ids, so a genuine task later REFRESHES the
# same story rather than adding a duplicate.
#
# Gated by a marker so a warm reboot does not clobber a fresher runtime story the
# auto-story skill may have posted under the same id. A redeploy lands on a fresh
# volume (new install, new key) with no marker, so the seeds re-post there.
# Best-effort and bounded: it waits for this install to finish registering, and
# if that never happens in the window it leaves the marker unset so a later boot
# retries. Never blocks or fails the agent (a texting agent must boot regardless).
PINCH_STORIES_MARKER=/var/lib/plow/.pinch-stories-seeded
PINCH_INDEX_CLIENT=/opt/plow/agent-index-client.py
PINCH_PUBLISH=/opt/plow/pinch-bin/pinch-publish-story
seed_stories() {
  [ -e "$PINCH_STORIES_MARKER" ] && return 0
  [ -r "$PINCH_INDEX_CLIENT" ] && [ -x "$PINCH_PUBLISH" ] || return 0
  # `status` reads local state only (0 registered, 3 not, 2 unreadable). Wait
  # for the base to register this install before posting with its key. The key
  # lives under $HOME/.agent-index and the base pins HOME to the state volume,
  # so read status with the SAME HOME or it looks in an empty home and never
  # sees the registration (pinch-publish-story applies the same pin itself).
  stories_home=${OPENCLAW_STATE_DIR:-/var/lib/plow}
  registered=
  for _ in $(seq 1 60); do
    if HOME="$stories_home" python3 "$PINCH_INDEX_CLIENT" status >/dev/null 2>&1; then registered=1; break; fi
    sleep 5
  done
  if [ -z "$registered" ]; then
    echo "[pinch] stories: install not registered yet; will seed on a later boot" >&2
    return 0
  fi
  ok=1
  "$PINCH_PUBLISH" pinch-uc-photo-recipe "Saved a recipe from a texted photo." \
    --body "Someone texted a dish they loved. Pinch read the photo, pulled the recipe together, and saved it to their library, image and all, in a few seconds." \
    --tag recipes --tag photo --tag library \
    --image https://pinch.usesundays.com/aiwu/02-recipes.png >/dev/null 2>&1 || ok=
  "$PINCH_PUBLISH" pinch-uc-week-grocery "Turned a week of meals into one grocery list." \
    --body "Picked the week's dinners and Pinch built a single consolidated grocery list, ingredients combined and grouped by aisle, ready to shop." \
    --tag meal-plan --tag groceries --tag planning \
    --image https://pinch.usesundays.com/aiwu/06-grocery-list.png >/dev/null 2>&1 || ok=
  "$PINCH_PUBLISH" pinch-uc-wine-pairing "Paired a wine with tonight's dinner." \
    --body "Asked what to pour with dinner. Pinch looked at what was planned and suggested a crisp, bright white that played well with the dish, no guesswork." \
    --tag wine --tag pairing --tag dinner \
    --image https://pinch.usesundays.com/aiwu/01-chat.png >/dev/null 2>&1 || ok=
  if [ -n "$ok" ]; then
    : > "$PINCH_STORIES_MARKER" 2>/dev/null || true
    echo "[pinch] seeded 3 AIWU use-case stories"
  else
    echo "[pinch] WARN: could not seed all AIWU stories; will retry on a later boot" >&2
  fi
  return 0
}
seed_stories &

exec node /opt/plow/boot/main.js
