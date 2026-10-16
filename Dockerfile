# Pinch — OpenClaw agent variant (recipe capture + library over SMS).
#
# Built FROM the pinned Plow OpenClaw base image, by digest. The tag names the
# commit of plow-pbc/plow-openclaw-agent that produced it; the digest is what
# actually boots (a tag is a name someone can move, and this image boots holding
# a live Plow credential). Base is published to a public ECR registry and is
# pullable anonymously — no registry auth needed to build.
#   repo commit: ddbaa6bc0f9e071d9411777b91590e755e367d84
FROM public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-ddbaa6bc0f9e071d9411777b91590e755e367d84@sha256:5b0ebf5e33514b09f0f22f1c14424a19b4eb3fc21adfaeb260002f76d362478c

# --- Pinch backend wiring -------------------------------------------------
# Non-secret base URL of the live recipe backend the capture/library skills call.
ENV PINCH_BACKEND_URL=https://pinch.maryandjake.us
# The bearer token (= backend PINCH_RECIPE_TOKEN) is a SECRET supplied at run
# time as `PINCH_API_TOKEN` via env/secret (plow-agents env / compose env_file)
# and read from the runtime environment by the skills. It is deliberately NOT
# declared as an ENV here, so no secret-named value is ever baked into a layer.

# The base ships text-only `z-ai/glm-5.2` as the primary model; a texted photo
# reaches the agent but the primary can't read it, so photo capture would
# silently fail. `anthropic/claude-sonnet-5` (declared image-capable in the base
# config) is set as the primary via `agents.defaults.model`, which is a
# non-owned agent default: once set it survives restarts. The base exposes no
# build-time/env hook for this field and the state volume masks any baked config
# file, so it is applied at boot through the base's documented, restart-surviving
# `openclaw config set` path — see boot/pinch-entrypoint.sh.
USER root
COPY boot/pinch-entrypoint.sh /opt/plow/boot/pinch-entrypoint.sh
RUN chmod 0755 /opt/plow/boot/pinch-entrypoint.sh

# Variant customization surface: persona + skills baked into the locations the
# base boot reads (prompt rendered into the workspace AGENTS.md; skills loaded
# from /opt/plow/skills via config `skills.load.extraDirs`).
COPY prompt/AGENTS.md /opt/plow/prompt/AGENTS.md
COPY skills/ /opt/plow/skills/

USER node

# Wrap — not replace — the inherited boot so Plow's usage reporter and config
# rendering stay intact; the wrapper only layers the model override on top.
CMD ["/opt/plow/boot/pinch-entrypoint.sh"]
