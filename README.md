# Pinch — OpenClaw agent variant

Pinch is a texting home-cooking assistant: it captures recipes the owner sends
(URL, pasted text, photo, or social post) and recalls them on request. It is an
OpenClaw agent **variant** built on the pinned Plow OpenClaw base image, talking
to the live Pinch backend at <https://pinch.maryandjake.us> (shared recipe
library with the Pinch web app).

This repo is the Chunk 6 scaffold: persona + skill stubs + build wiring. The
skill logic lands in Chunks 7 (capture) and 8 (library).

## Layout

```
Dockerfile                      FROM the pinned base; copies persona + skills; wires backend env
boot/pinch-entrypoint.sh        wraps the inherited boot to set the image-capable primary model
prompt/AGENTS.md                Pinch's persona (rendered into the workspace prompt at boot)
skills/capture-recipe/SKILL.md  stub — capture a recipe → upsert to backend (Chunk 7)
skills/recipe-library/SKILL.md  stub — search/read the library over text (Chunk 8)
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
| `PINCH_BACKEND_URL` | Backend base URL the skills call | Baked (`https://pinch.maryandjake.us`); override via env if needed |
| `PINCH_API_TOKEN` | Bearer token = backend `PINCH_RECIPE_TOKEN` | **Secret — injected at deploy, never baked** |
| `PLOW_API_BASE` / `PLOW_AGENT_TOKEN` | Plow line credentials | Injected by the Plow host / local `plow-credentials` |

The agent authenticates to the backend with `Authorization: Bearer
$PINCH_API_TOKEN`. Keep the token out of the image — supply it at run time
(`plow-agents` env, or Compose `env_file`).

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
