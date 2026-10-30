# Pinch — OpenClaw agent variant (recipe capture + library over SMS).
#
# Built FROM the pinned Plow OpenClaw base image, by digest. The tag names the
# commit of plow-pbc/plow-openclaw-agent that produced it; the digest is what
# actually boots (a tag is a name someone can move, and this image boots holding
# a live Plow credential). Base is published to a public ECR registry and is
# pullable anonymously — no registry auth needed to build.
#   repo commit: e04b69b5081f20435f926803716bc842caf58923
# (base bump 2026-10-30: the new Latch base — reaches the owner's machines through
#  latch only and DROPS the old Mac relay; ships + installs latch at build/boot and
#  sets LATCH_STATE_DIR=/var/lib/plow/latch on the state volume. plow-openclaw-agent
#  main @ e04b69b, the "latch-only" series #132/#133/#134, 2026-10-29 (post-Oct-28).)
# ⚠️ On this base digest bump, RE-VERIFY the entrypoint model pre-seed drift check
#  (boot/pinch-entrypoint.sh) against the new base's fresh config render before build.
FROM public.ecr.aws/e1h7x4a2/plow-cloud-agents:base-e04b69b5081f20435f926803716bc842caf58923@sha256:dd253a0a186009cc59c81ed366cc9a1a09987335e2018436d96a05a90c354f80

# --- Pinch backend wiring -------------------------------------------------
# Non-secret base URL of the live recipe backend the capture/library skills call.
ENV PINCH_BACKEND_URL=https://pinch.usesundays.com
# Bake the Agent Index id so the base's usage reporter / identity attaches to the
# right agent record (the base ships none by default).
ENV AGENT_ID=pinch
# The bootstrap/fallback bearer (= backend PINCH_RECIPE_TOKEN) is a SECRET
# supplied at run time as `PINCH_API_TOKEN` via env/secret (plow-agents env /
# compose env_file). It is deliberately NOT declared as an ENV here, so no
# secret-named value is ever baked into a layer. On first boot the agent
# self-registers its own account (see boot/pinch-entrypoint.sh + bin/pinch-register)
# and caches a per-account token pair on the state volume; the helpers prefer that
# cached token, using PINCH_API_TOKEN only until the pair is cached.

# The base ships text-only `z-ai/glm-5.2` as the primary model; a texted photo
# reaches the agent but the primary can't read it, so photo capture would
# silently fail. `anthropic/claude-sonnet-5` (declared image-capable in the base
# config) is set as the primary via `agents.defaults.model`, a non-owned agent
# default. The base exposes no build-time/env hook for this field and the state
# volume masks any baked config file, so on a FRESH volume the entrypoint
# pre-seeds `agents.defaults.model` into the persisted config BEFORE boot renders
# it — the base's config render preserves that non-owned field, so the gateway
# starts image-capable with no reload or restart (critical: the managed runtime
# does not restart an agent that exits). See boot/pinch-entrypoint.sh.
USER root
COPY boot/pinch-entrypoint.sh /opt/plow/boot/pinch-entrypoint.sh
RUN chmod 0755 /opt/plow/boot/pinch-entrypoint.sh

# Media deps:
#  - pinch-video: ffmpeg/ffprobe for frame sampling, and yt-dlp for metadata +
#    download.
#  - pinch-set-image: ImageMagick (+ libheif for HEIC decode) to turn a texted
#    iOS photo (usually HEIC, often >4MB, both of which the image endpoint rejects)
#    into an auto-oriented JPEG downscaled + size-capped to <=4MB before upload.
#    ImageMagick decodes HEIC via its libheif delegate; `heif-convert` from
#    libheif-examples is the decode fallback the helper uses if the delegate is
#    absent. `jpeg:extent` lets one convert pass target the byte size.
# All via apt (no recommends, lists cleaned to keep the layer lean). This is an
# apt add only; it does NOT change the FROM base, so the pre-seed drift check does
# not apply.
# NOTE: yt-dlp is intentionally tracked at `latest` — site extractors break
# often, so recency is the point; bump/pin on a schedule in production.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg imagemagick libheif1 libheif-examples \
 && rm -rf /var/lib/apt/lists/* \
 && curl -fsSL -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod 0755 /usr/local/bin/yt-dlp \
 && /usr/local/bin/yt-dlp --version

# Backend-client helpers the skills invoke via the shell tool (the base has no
# web-fetch tool). Shared by both skills, so they live in one dir on PATH rather
# than duplicated per skill. They read PINCH_BACKEND_URL + PINCH_API_TOKEN from
# the env (Node, no extra deps).
COPY bin/ /opt/plow/pinch-bin/
RUN chmod 0755 /opt/plow/pinch-bin/*
# ENV covers non-login shells (the usual `sh -c` tool exec); the profile.d entry
# + .bashrc sourcing cover login and interactive shells (which reset PATH from
# /etc/profile), mirroring how the base exposes `openclaw`. The skills also name
# the absolute dir as a fallback.
ENV PATH="/opt/plow/pinch-bin:${PATH}"
RUN printf 'export PATH="/opt/plow/pinch-bin:$PATH"\n' > /etc/profile.d/pinch-path.sh \
 && printf '\n. /etc/profile.d/pinch-path.sh\n' >> /home/node/.bashrc

# Variant customization surface: persona + long-term memory + skills baked into
# the locations the base boot reads (prompt rendered into the workspace AGENTS.md;
# MEMORY.md seeded into the workspace by the entrypoint — see boot/pinch-entrypoint.sh;
# skills loaded from /opt/plow/skills via config `skills.load.extraDirs`).
COPY prompt/AGENTS.md /opt/plow/prompt/AGENTS.md
COPY prompt/MEMORY.md /opt/plow/prompt/MEMORY.md
COPY skills/ /opt/plow/skills/

USER node

# Wrap — not replace — the inherited boot so Plow's usage reporter and config
# rendering stay intact; the wrapper only layers the model override on top.
CMD ["/opt/plow/boot/pinch-entrypoint.sh"]
