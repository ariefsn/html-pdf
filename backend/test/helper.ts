// This file contains code that we reuse between our tests.
import Fastify, { FastifyInstance } from 'fastify'
import * as test from 'node:test'
import { app as appPlugin, options } from '../src/app.js'

export type TestContext = {
  after: typeof test.after
};

// Env the app requires at boot. DISABLE_NATS keeps ready() from hanging on a
// live broker; QUEUE_URL is still required by the env schema even unused.
function config () {
  process.env.DISABLE_NATS = 'true'
  process.env.QUEUE_URL ??= 'nats://127.0.0.1:4222'
  process.env.QUEUE_SUBJECT ??= 'generate.pdf'
  process.env.QUEUE_SUBSCRIBE ??= 'generate.>'
}

// Build the app directly rather than through fastify-cli/helper.js: that
// helper is a CJS shim whose API moves between fastify-cli majors, and we
// don't need its argv parsing. Keeping it out of the test path means a
// fastify-cli upgrade can only affect `yarn start` / `yarn dev`.
async function build (t: TestContext): Promise<FastifyInstance> {
  config()

  const app = Fastify({ logger: false })
  void app.register(appPlugin, options)
  await app.ready()

  t.after(() => void app.close())

  return app
}

export {
  build,
  config
}
