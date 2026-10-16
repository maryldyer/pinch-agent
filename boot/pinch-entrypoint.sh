#!/usr/bin/env bash
# Pinch variant entrypoint. Wraps the inherited Plow boot so the usage reporter
# and Plow-owned config rendering are untouched; it only layers Pinch's required
# model override on top.
#
# Why a wrapper: the base seeds `agents.defaults.model` with the text-only
# primary `plow/z-ai/glm-5.2` and exposes no build-time/env hook to change it.
# That field is a NON-OWNED agent default, so once set it survives restarts
# (unlike the Plow-owned `$include` settings). The base's documented mechanism
# for such changes is `openclaw config set` (Control UI / CLI), which persists
# to the state volume. The base boot renders the config and starts the gateway
# in one process, so we launch boot in the foreground and, in the background,
# wait for the gateway's per-boot password to appear, then set the model once.
#
# NOTE: `reload.mode` is off in the base, so the override takes effect on the
# next turn/restart; it then persists. Applying it is best-effort and never
# blocks or fails the agent — a texting agent must still boot if the override
# cannot be applied.
set -euo pipefail

PINCH_MODEL_JSON='{"primary":"plow/anthropic/claude-sonnet-5","fallbacks":["plow/z-ai/glm-5.2"]}'

apply_model_override() {
  # Wait (bounded) for boot to write the gateway password, then authenticate the
  # local CLI over loopback and set the image-capable primary model.
  for _ in $(seq 1 60); do
    if [ -r /var/lib/plow/gateway-password ]; then
      OPENCLAW_GATEWAY_PASSWORD="$(cat /var/lib/plow/gateway-password)"
      export OPENCLAW_GATEWAY_PASSWORD
      export OPENCLAW_STATE_DIR=/var/lib/plow
      export OPENCLAW_CONFIG_PATH=/var/lib/plow/openclaw.json
      if openclaw config set agents.defaults.model "$PINCH_MODEL_JSON" >/dev/null 2>&1; then
        echo "[pinch] primary model set to anthropic/claude-sonnet-5 (image-capable)"
        return 0
      fi
    fi
    sleep 2
  done
  echo "[pinch] WARN: could not apply model override; base default remains active" >&2
  return 0
}

apply_model_override &

exec node /opt/plow/boot/main.js
