FROM node:18-alpine AS base

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat g++ gcc libgcc

# Install Chromium and fonts
# Note: this installs the necessary libs to make the browser work with Puppeteer. The `base` will be uses in the future steps.
RUN apk add chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  nodejs \
  yarn \
  rm -rf /var/cache/apk/*

# 1. Install dependencies only when needed
FROM base AS deps
WORKDIR /app

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

ARG PORT
ARG WEBHOOK_URL
ARG QUEUE_URL

ENV PORT $PORT
ENV WEBHOOK_URL $WEBHOOK_URL
ENV QUEUE_URL $QUEUE_URL

RUN yarn build:ts

# 3. Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

RUN addgroup -g 1001 -S appgroup
RUN adduser -S appuser -u 1001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist

USER appuser

EXPOSE $PORT

CMD ["yarn", "start"]
