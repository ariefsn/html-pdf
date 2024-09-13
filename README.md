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

## Notes

- This service is using NATS, run NATS server locally or either with docker already in `compose/compose.yaml` file.
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
| webhookUrl | No | This service can talk with the client application using this, it will hit the URL with method `POST` and the query `alias` if any, also the body is a PDF as a buffer |

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
