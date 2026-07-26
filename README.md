# HTML to PDF

A mini service to generate PDF from HTML, uses Handlebars for parsing the HTML, Puppeteer to run the headless browser, and NATS for handling queue.

## Tools

- [Fastify](https://fastify.io/)
- [Handlebars](https://handlebarsjs.com/)
- [Puppeteer](https://pptr.dev/)
- [NATS](https://nats.io/)
- [Docker](https://www.docker.com/)

## How to

1. Go to `compose` directory `cd compose`.
2. Copy the `.env.example` to `.env` and set the variables.
3. Run `docker compose up --build -d`.
4. The swagger documentation is on path `/docs`.
5. The main endpoint is `/pdf` with method `POST`, for the [payload](#payload) described below.

## Upgrading to v2

v2.0.0 upgrades the whole dependency stack (Fastify 5, Zod 4, Puppeteer 25, html-validate 11) and moves the image to Node 22. There is **one breaking change to the API**, plus two operational requirements.

### Breaking: the `details` array on 400 responses

When a request fails validation the service still returns `400` with the same `success` / `data` / `message` / `details` envelope. Only the objects **inside** `details` changed, because the validation errors now arrive in Fastify's shape rather than Zod's.

Before (v1.x):

```json
{
  "success": false,
  "data": null,
  "message": "Invalid input",
  "details": [
    { "code": "invalid_type", "fatal": false, "message": "Required", "path": "html" }
  ]
}
```

After (v2.0.0):

```json
{
  "success": false,
  "data": null,
  "message": "Invalid input",
  "details": [
    {
      "keyword": "invalid_type",
      "instancePath": "/html",
      "schemaPath": "#/html/invalid_type",
      "message": "Invalid input: expected string, received undefined",
      "params": { "expected": "string" }
    }
  ]
}
```

Field mapping:

| v1.x | v2.0.0 | Note |
|---|---|---|
| `code` | `keyword` | Same values, e.g. `invalid_type`, `custom`. |
| `path` | `instancePath` | Now a JSON-pointer style path: `html` becomes `/html`. |
| `message` | `message` | Unchanged in meaning; Zod 4 wording is more descriptive. |
| `fatal` | — | Removed. |
| — | `schemaPath` | New. |
| — | `params` | New; per-issue metadata, may be `{}`. |

HTML validation errors are unaffected in content: they still arrive as `keyword: "custom"` with a message starting `Invalid HTML:`.

**Only clients that read individual fields inside `details` need changing.** Anything checking `success`, `message`, or the HTTP status works as-is.

### Node 22 required

The image is now `node:22-alpine`. If you run the service outside Docker you need **Node >= 22.22.0** (this is html-validate 11's floor; Puppeteer 25 requires >= 22.12.0). This is enforced via `engines` in `package.json`.

### Chromium is no longer downloaded at build time

The Dockerfile sets `PUPPETEER_SKIP_DOWNLOAD=true` and points `PUPPETEER_EXECUTABLE_PATH` at the Alpine `chromium` package, so builds no longer pull a second ~170MB browser. The old `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD` variable in `compose/.env` was renamed away by Puppeteer v20 and had no effect; it has been removed. If you run outside Docker, either install Chrome and set `PUPPETEER_EXECUTABLE_PATH`, or install dependencies without `PUPPETEER_SKIP_DOWNLOAD` so Puppeteer fetches its own browser.

`DISABLE_NATS=true` also exists now, but it is for the test suite only — it replaces the queue with a stub and must never be set in a deployment.

## Tag Management

Commands to manage git tags for Docker image releases.

| Command | Usage | Description |
|---|---|---|
| `tag-delete` | `make tag-delete TAG=v1.0.0` | Delete tag from local and remote |
| `tag-push` | `make tag-push TAG=v1.0.0` | Create and push a new tag |
| `tag-repush` | `make tag-repush TAG=v1.0.0` | Delete existing tag and re-push (useful when a build fails) |

## Environment Variables

| Variable | Required | Default | Desc |
|---|---|---|---|
| `PORT` | No | `3000` | Port the HTTP server listens on. |
| `QUEUE_URL` | Yes | — | NATS connection string. Carries credentials and TLS settings — see [Connecting to a protected NATS](#connecting-to-a-protected-nats). |
| `QUEUE_SUBJECT` | No | `generate.pdf` | Subject the `/pdf` endpoint publishes jobs to. |
| `QUEUE_SUBSCRIBE` | No | `generate.>` | Subject pattern the worker subscribes to. |

## Connecting to a protected NATS

Everything needed to reach an authenticated NATS server goes in `QUEUE_URL` — there are no separate username or password variables.

```
nats://[user:pass@|token@]host:port[,host:port...][?tls=true&tls_ca_file=…&tls_insecure=true]
tls://…   # the tls:// scheme also enables TLS
```

| Example | Result |
|---|---|
| `nats://nats:4222` | no auth |
| `nats://user:pass@nats:4222` | user/password |
| `nats://sometoken@nats:4222` | token (userinfo with no password) |
| `tls://user:pass@nats:4222` | user/password + TLS |
| `nats://u:p@nats:4222?tls=true&tls_insecure=true` | TLS, skip verification (dev only) |
| `tls://u:p@nats:4222?tls_ca_file=/certs/ca.pem` | TLS with a private CA |
| `nats://user:pass@h1:4222,h2:4222` | cluster; credentials taken from the first entry |
| `nats:4222` | no scheme — still works |

**Special characters in a password must be percent-encoded**, exactly as in a Postgres or Redis connection string. For example `p@ss` becomes `p%40ss`, and `a,b` becomes `a%2Cb`. An unencoded `@` or `,` will be misread as a host separator.

TLS query parameters:

| Parameter | Desc |
|---|---|
| `tls` | `true` enables TLS using the system CA store. Implied by the `tls://` scheme. |
| `tls_ca_file` | Path to a CA certificate, for a private/self-signed CA. |
| `tls_cert_file` | Path to a client certificate, for mTLS. |
| `tls_key_file` | Path to the client private key, for mTLS. |
| `tls_insecure` | `true` skips certificate verification. Development only. |

Notes:

- Credentials in `QUEUE_URL` are parsed by **this service**. The underlying nats.js client ignores userinfo in a server URL on its own, so this syntax works here even though passing the same URL straight to the library would not authenticate.
- NKey, JWT and `.creds` file authentication are not supported, so managed NATS (Synadia Cloud / NGS) will not work.
- The connection log prints only host, port and the auth mode — a password is never written to the logs.

## Notes

- This service is using NATS. Run a NATS server locally, or use the one in `compose/compose.yaml`. That bundled server is unauthenticated and intended for local development; point `QUEUE_URL` at your own server to use authentication.
- The `client` directory is only the example how to interact with the service.

## Payload

| Field | Required | Desc |
|---|---|---|
| html | Yes | The escaped HTML string for rendering. |
| header | No | The escaped HTML string for header purpose. |
| footer | No | The escaped HTML string for footer purpose. |
| margin | No | The object for setting the margin `{ top, right, bottom, left }`. |
| alias | No | The alias for the filename. |
| values | No | The object for the data that needed by the `html`. |
| format | No | The format for generated PDF, should be one of `"letter" \| "legal" \| "tabloid" \| "ledger" \| "a0" \| "a1" \| "a2" \| "a3" \| "a4" \| "a5" \| "a6"`, this field will take over the `width` and `height`. |
| width | No | Width of document. Ignored if `format` is filled. |
| height | No | Height of document. Ignored if `format` is filled. |
| webhookUrl | No | URL to receive the generated PDF. The service will `POST` a JSON body containing `alias`, `metadata`, and `pdf` (base64-encoded). See [Webhook Payload](#webhook-payload) below. |
| metadata | No | Arbitrary key-value object sent along with the webhook, so the receiver can identify/route the data (e.g. `{ "orderId": "123", "userId": "456" }`). |

## Webhook Payload

When `webhookUrl` is provided, the service will `POST` a JSON body to that URL:

```json
{
  "alias": "my-document",
  "metadata": { "orderId": "123", "userId": "456" },
  "pdf": "<base64-encoded PDF>"
}
```

| Field | Type | Description |
|---|---|---|
| alias | string | The filename alias (without `.pdf` extension). |
| metadata | object | The metadata object from the original request (defaults to `{}`). |
| pdf | string | The generated PDF file, base64-encoded. |

## Registered Helper

| Name | Arguments | Return |
|------|-----------|--------|
| add | `number, number` | `number` |
| min | `number, number` | `number` |
| mul | `number, number` | `number` |
| div | `number, number` | `number` |
| gt | `number, number` | `boolean` |
| gte | `number, number` | `boolean` |
| lt | `number, number` | `boolean` |
| lte | `number, number` | `boolean` |
| eq | `number, number` | `boolean` |
| ne | `number, number` | `boolean` |
| or | `boolean, boolean` | `boolean` |
| and | `boolean, boolean` | `boolean` |
| not | `boolean` | `boolean` |
| contains | `string, string` | `boolean` |
| startWith | `string, string` | `boolean` |
| endWith | `string, string` | `boolean` |
| replace | `string, string, string` | `string` |
| json | `object` | `string` |
| lower | `string` | `string` |
| upper | `string` | `string` |
| isEmpty | `any` | `boolean` |
