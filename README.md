# Pinch — OpenClaw agent variant

Pinch is a texting home-cooking assistant: it captures recipes the owner sends
(URL, pasted text, photo, or social post) and recalls them on request. It is an
OpenClaw agent **variant** built on the pinned Plow OpenClaw base image, talking
to the live Pinch backend at <https://pinch.usesundays.com> (shared recipe
library with the Pinch web app).

## Layout

```
Dockerfile                        FROM the pinned base; copies persona + skills; wires backend env
boot/pinch-entrypoint.sh          wraps the inherited boot: model override + background self-register
prompt/AGENTS.md                  Pinch's persona (rendered into the workspace prompt at boot)
bin/pinch-save|get|search         backend helpers (auth via the cached account token)
bin/pinch-register                self-register-on-boot with token caching (register once)
bin/pinch-connect-dashboard       rotate/return the account's read-only dashboard token
bin/lib/onboarding.js             injectable onboarding core (assertion mint, register, cache)
bin/lib/pinch-token.js            resolves the bearer the helpers present (cached → fallback)
skills/capture-recipe/SKILL.md    capture a recipe → upsert to backend
skills/recipe-library/SKILL.md    search/read the library over text
skills/connect-dashboard/SKILL.md hand the owner their read-only dashboard token
test/                             Node built-in-runner unit tests for the boot/onboarding logic
```

## Base image

```
public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-ddbaa6bc0f9e071d9411777b91590e755e367d84@sha256:5b0ebf5e33514b09f0f22f1c14424a19b4eb3fc21adfaeb260002f76d362478c
```

Pinned by digest (multi-arch: linux/amd64 + linux/arm64). The tag names the
commit of `plow-pbc/plow-openclaw-agent` that built it. The base lives in a
public ECR registry and pulls anonymously — no registry auth to build.

## Configuration (env / secrets)

| Var | Purpose | Where set |
| --- | --- | --- |
| `PINCH_BACKEND_URL` | Backend base URL the skills call | Baked (`https://pinch.usesundays.com`); override via env if needed |
| `PINCH_API_TOKEN` | Bootstrap/fallback bearer (= backend `PINCH_RECIPE_TOKEN`) | **Secret — injected at deploy, never baked.** Only used until the account token pair is cached (see Onboarding) |
| `PLOW_API_BASE` / `PLOW_AGENT_TOKEN` | Plow line credentials | Injected by the Plow host / local `plow-credentials` |
| `PLOW_INDEX_API_BASE` | Index Identity mint host | Defaults to `https://api.plow.co`; override only for testing |
| `PINCH_STATE_DIR` / `PINCH_TOKENS_PATH` | Where the cached `{full,readonly}` pair lives | Defaults to `/var/lib/plow/pinch/tokens.json` (the state volume) |

The agent authenticates to the backend with `Authorization: Bearer <account
full token>`, resolved from the cached token pair on the state volume (see
Onboarding below), falling back to `$PINCH_API_TOKEN` until that pair lands.
Keep secrets out of the image — supply them at run time (`plow-agents` env, or
Compose `env_file`).

## Onboarding (multi-tenant self-registration)

On first boot the agent registers its own Pinch account and caches the issued
tokens, so later boots do no network work:

- **Register once, then cache.** `boot/pinch-entrypoint.sh` runs `pinch-register`
  in the background. If a `{full,readonly}` token pair is already cached on the
  state volume (`/var/lib/plow/pinch/tokens.json`, mode 0600), it is a no-op. On
  a first-ever boot (or a wiped volume) it mints a short-lived Plow **Index
  Identity assertion** (`GET api.plow.co/v1/auth/index-identity`, the agent's own
  bearer never leaves the container), presents it to `POST /api/pinch/register`
  in the **`X-Plow-Index-Assertion`** header, and persists the returned token
  pair. `pinch-register --rotate` forces a re-register (new full token).
- **Best-effort.** The backend register endpoint is not live yet, so boot
  registration never blocks the agent — the skills use the `PINCH_API_TOKEN`
  fallback until the pair is cached.
- **`connect dashboard`.** When the owner texts an intent to pair a dashboard,
  the `connect-dashboard` skill runs `pinch-connect-dashboard`, which rotates a
  fresh **read-only** token via the backend (falling back to the cached readonly)
  and texts it plus the `${PINCH_BACKEND_URL}/wall-sync.mjs` URL.

The onboarding logic (`bin/lib/onboarding.js`) is injectable and unit-tested
(`npm test` — Node's built-in runner) without a live backend. Deferred
live-integration points are listed in the branch's notes.

## Model

The base seeds the text-only `plow/z-ai/glm-5.2` as the primary model. Pinch
needs an **image-capable** primary so texted recipe photos can be read, so the
variant sets `agents.defaults.model` primary to `plow/anthropic/claude-sonnet-5`
(glm kept as fallback). `agents.defaults.model` is a non-owned agent default:
once set it survives restarts. The base exposes no build-time hook for it and
the state volume masks any baked config file, so `boot/pinch-entrypoint.sh`
applies it at boot via the base's documented `openclaw config set` path, wrapping
— not replacing — the inherited boot so Plow's usage reporter stays intact.

## Build & deploy

```sh
plow-agents image build  REGISTRY/REPOSITORY:TAG
plow-agents image push   REGISTRY/REPOSITORY:TAG
plow-agents deploy       REGISTRY/REPOSITORY@sha256:DIGEST --line LINE_UID
```

`AGENT_ID` is intentionally unset (no Agent Index registration required for v1);
set it later to opt into the index + usage reporting.
