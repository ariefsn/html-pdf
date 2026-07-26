# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[Unreleased]: https://github.com/ariefsn/html-pdf/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/ariefsn/html-pdf/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/ariefsn/html-pdf/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ariefsn/html-pdf/releases/tag/v1.0.0
