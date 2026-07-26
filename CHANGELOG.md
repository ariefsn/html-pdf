# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-07-26

Dependency upgrade across the whole stack. See [Upgrading to v2](README.md#upgrading-to-v2) for migration steps.

### Breaking Changes

- The objects inside the `details` array of a `400` validation response changed shape. The type provider now hands Fastify-shaped validation errors to the error handler instead of raw Zod issues, so `{ code, fatal, message, path }` became `{ keyword, instancePath, schemaPath, message, params }`. `code` maps to `keyword`, `path` maps to `instancePath` (now JSON-pointer style, `html` → `/html`), and `fatal` is gone. The surrounding `success` / `data` / `message` envelope and the `400` status are unchanged, so only clients reading individual fields inside `details` are affected.
- **Node >= 22.22.0 is now required** and enforced through `engines`. The Docker image moved from `node:18-alpine` (EOL) to `node:22-alpine`. The floor comes from html-validate 11; Puppeteer 25 requires >= 22.12.0.
- `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` was removed from `compose/.env`. Puppeteer renamed it in v20, so it had no effect, and skipping the download is an install-time concern handled in the Dockerfile via `PUPPETEER_SKIP_DOWNLOAD`.

### Changed

- Upgraded Fastify 4 → 5 with the whole plugin set (`@fastify/autoload` 6, `@fastify/env` 7, `@fastify/swagger` 9, `@fastify/swagger-ui` 6, `fastify-cli` 8, `fastify-plugin` 6), Zod 3 → 4 and `fastify-type-provider-zod` 2 → 7. These are peer-locked and had to move together.
- Upgraded Puppeteer 22 → 25 and html-validate 8 → 11, plus `nats` 2.29.3, `handlebars` 4.7.9 and `@types/node` 22.
- `page.setContent` now waits for `load` instead of `networkidle2`, which Puppeteer 25 no longer accepts there. Subresources are still awaited, so PDF fidelity is unaffected.
- Plugin registration in `app.ts` is now awaited in explicit dependency order rather than relying on avvio's deferral for correctness.
- Docker builds no longer download a Chromium the image never uses, and the runner sets `PUPPETEER_EXECUTABLE_PATH` so the image works under plain `docker run`.
- Test runner moved from `ts-node/esm` to `tsx`, which resolves this project's extensionless directory imports.

### Added

- A working test suite: 14 tests covering the root route, `POST /pdf` validation including the HTML-validation path, and `parseQueueUrl`, plus an opt-in Chromium render smoke test behind `RUN_PDF_SMOKE`. Previously `npm test` could not compile.
- `DISABLE_NATS=true` to build the app without a live broker. Test-only; never set it in a deployment.

### Fixed

- The webhook payload used `Buffer.from(pdf.buffer)`, which ignores the view's `byteOffset`/`byteLength` and would emit the whole backing buffer. Dormant under Puppeteer 22, which returns exactly-sized arrays, but not guaranteed under 25.
- The error handler is registered before routes. With awaited registration it would otherwise sit on the root instance while routes live in an encapsulated child, so clients would receive Fastify's raw `FST_ERR_VALIDATION` body instead of the `JsonError` envelope.
- `test/tsconfig.json` overrode `baseUrl`, breaking the `@src/*` path aliases and failing the typecheck with six errors.
- The Dockerfile installed `nodejs` and `yarn` from apk on top of the Node base image, shadowing the base image's Node.
- The `PORT` env schema declared `type: 'string'` with a numeric default.

### Removed

- Unused dependencies `@fastify/sensible` (registered but never called) and `@fastify/static` (no usages), the `plugins/support.ts` scaffolding, `c8`, `.taprc`, the `dev:start2` script (broken since Node 20), and dangling tsconfig path aliases.

## [1.2.0] - 2026-07-26

### Added

- Authentication for NATS, configured entirely through the existing `QUEUE_URL` connection string — no new environment variables. Supports user/password (`nats://user:pass@host:4222`), token (`nats://token@host:4222`), TLS (via the `tls://` scheme or `?tls=true`, with `tls_ca_file` / `tls_cert_file` / `tls_key_file` / `tls_insecure`), and comma-separated multi-host cluster URLs.
- `Environment Variables` and `Connecting to a protected NATS` sections in the README.

### Fixed

- A failed NATS connection no longer leaves the client null and surfaces later as `TypeError: Cannot read properties of null (reading 'subscribe')`. Startup now fails fast with the real error, such as `AUTHORIZATION_VIOLATION`.
- `QUEUE_SUBJECT` and `QUEUE_SUBSCRIBE` are now passed through to the container in `compose.yaml`. They were previously ignored under Docker, which silently fell back to the built-in defaults.
- `natsClient()` throws a clear `NATS not connected` error instead of returning a null connection that would fail on the next publish.
- Subscription failures are logged instead of becoming unhandled promise rejections.

### Changed

- Reconnection is now configured explicitly (unlimited retries with a 2s backoff and jitter), and connection status changes are logged.

## [1.1.0] - 2026-05-20

### Added

- Tini as the container entrypoint, so zombie Chromium children are reaped and PIDs are freed promptly.

### Changed

- PDF generation reuses a single module-level Chromium instance instead of launching a browser per message, which was saturating the cgroup `pids.max` and causing `posix_spawn` to fail with `EAGAIN`. The browser relaunches automatically if it dies.
- Dockerfile installs packages with `--no-cache`.

## [1.0.0] - 2026-04-08

### Added

- HTML to PDF service built on Fastify, with Handlebars templating and Puppeteer rendering, using NATS as the job queue.
- `POST /pdf` endpoint accepting HTML, header/footer, margins, paper format or explicit width/height, template values, and an alias.
- Webhook delivery: when `webhookUrl` is supplied, the generated PDF is POSTed back base64-encoded alongside its `alias` and arbitrary `metadata`.
- Swagger documentation at `/docs`.
- Handlebars helpers for arithmetic, comparison, logic and string operations.
- HTML validation of request payloads, returning structured 400 responses.
- Docker Compose setup and a multi-architecture (amd64/arm64) image publish workflow.
- Makefile targets for release tag management.
- Example client in `client/`.

[Unreleased]: https://github.com/ariefsn/html-pdf/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/ariefsn/html-pdf/compare/v1.2.0...v2.0.0
[1.2.0]: https://github.com/ariefsn/html-pdf/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ariefsn/html-pdf/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ariefsn/html-pdf/releases/tag/v1.0.0
