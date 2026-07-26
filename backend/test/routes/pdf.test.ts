import * as assert from 'node:assert'
import { test } from 'node:test'
import { build } from '../helper.js'

const VALID_HTML =
  '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><p>hi</p></body></html>'

// html-validate rejects this: unclosed <span> crossing the </div>.
const INVALID_HTML =
  '<!DOCTYPE html><html lang="en"><head><title>t</title></head><body><div><span></div></body></html>'

const post = (app: Awaited<ReturnType<typeof build>>, payload: unknown) =>
  app.inject({ method: 'POST', url: '/pdf', payload: payload as never })

test('POST /pdf rejects a body with no html', async (t) => {
  const app = await build(t)

  const res = await post(app, {})

  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.payload)
  assert.equal(body.success, false)
  assert.ok(Array.isArray(body.details), 'details should be an array')
  assert.ok(body.details.length > 0, 'details should not be empty')
})

// The highest-value test in the suite: one request covers the superRefine
// semantics, the custom issue code, and the html-validate integration.
test('POST /pdf rejects invalid html', async (t) => {
  const app = await build(t)

  const res = await post(app, { html: INVALID_HTML })

  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.payload)
  assert.equal(body.success, false)
  // Assert on presence and prefix only -- the surrounding detail shape is
  // expected to change with the type provider upgrade.
  const messages: string[] = body.details.map((d: { message?: string }) => d.message ?? '')
  assert.ok(
    messages.some((m) => m.startsWith('Invalid HTML:')),
    `expected an "Invalid HTML:" message, got ${JSON.stringify(messages)}`,
  )
})

test('POST /pdf validates the header field too', async (t) => {
  const app = await build(t)

  const res = await post(app, { html: VALID_HTML, header: INVALID_HTML })

  assert.equal(res.statusCode, 400)
  const body = JSON.parse(res.payload)
  assert.equal(body.success, false)
  const messages: string[] = body.details.map((d: { message?: string }) => d.message ?? '')
  assert.ok(
    messages.some((m) => m.startsWith('Invalid HTML:')),
    `expected an "Invalid HTML:" message, got ${JSON.stringify(messages)}`,
  )
})

// A valid body passes validation and enters the handler, which publishes to
// NATS. The harness sets DISABLE_NATS=true and decorates `nats` with a
// thrower, so a 500 here is the assertion: it proves validation passed and
// the handler ran. Do not "fix" this to expect 200.
test('POST /pdf accepts a valid body and reaches the handler', async (t) => {
  const app = await build(t)

  const res = await post(app, { html: VALID_HTML, alias: 'ok' })

  assert.equal(res.statusCode, 500)
  assert.notEqual(JSON.parse(res.payload).success, true)
})
