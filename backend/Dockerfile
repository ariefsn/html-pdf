FROM node:22-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat g++ gcc libgcc

# Install Chromium and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer. The `base` will be used in the future steps.
# Deliberately no nodejs/yarn here: the base image already provides both, and
# Alpine's packages would shadow them with a different (older) Node.
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
  && rm -rf /var/cache/apk/*

# 1. Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Chromium comes from apk above, so skip Puppeteer's own ~170MB download.
# This is an install-time concern, hence here rather than in compose.
ENV PUPPETEER_SKIP_DOWNLOAD=true

# Install dependencies based on the preferred package manager
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then corepack enable pnpm && pnpm i; \
  else echo "Lockfile not found." && exit 1; \
  fi


# 2. Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No build ARGs for config: `yarn build:ts` is just tsc and reads none of
# them, and passing credentials at build time would bake them into layers.
# Everything is supplied at runtime instead.
RUN yarn build:ts

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# tini reaps zombie children of Chromium so PIDs are freed promptly. Belt &
# braces with compose `init: true`; this keeps the image safe under plain
# `docker run` too.
RUN apk add --no-cache tini

RUN addgroup -g 1001 -S appgroup
RUN adduser -S appuser -u 1001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

# Point Puppeteer at the apk Chromium so the image works under plain
# `docker run`, not only when compose supplies this.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

USER appuser

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["yarn", "start"]
