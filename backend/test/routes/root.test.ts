import * as assert from 'node:assert'
import { test } from 'node:test'
import { build } from '../helper.js'

// This doubles as the serializer canary: it exercises the zod
// serializerCompiler, the 200 response schema and JsonOk together, so it is
// the first thing to go red if the type provider changes serialization.
test('GET / returns the JsonOk envelope', async (t) => {
  const app = await build(t)

  const res = await app.inject({ url: '/' })

  assert.equal(res.statusCode, 200)
  assert.deepStrictEqual(JSON.parse(res.payload), {
    success: true,
    data: 'Welcome to HTML PDF gen',
    message: '',
    details: null,
  })
})
