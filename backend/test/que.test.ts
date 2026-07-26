import * as assert from 'node:assert'
import { test } from 'node:test'
import { parseQueueUrl } from '../src/que/index.js'

test('parseQueueUrl reads plain host:port', () => {
  const { servers, mode, tls, authenticator } = parseQueueUrl('nats://nats:4222')
  assert.deepStrictEqual(servers, ['nats:4222'])
  assert.equal(mode, 'none')
  assert.equal(tls, undefined)
  assert.equal(authenticator, undefined)
})

test('parseQueueUrl works without a scheme', () => {
  assert.deepStrictEqual(parseQueueUrl('nats:4222').servers, ['nats:4222'])
})

test('parseQueueUrl reads user/password', () => {
  const { mode, authenticator } = parseQueueUrl('nats://user:pass@nats:4222')
  assert.equal(mode, 'user/pass')
  assert.deepStrictEqual(authenticator?.(''), { user: 'user', pass: 'pass' })
})

test('parseQueueUrl decodes percent-encoded credentials', () => {
  // p%40ss%2Cx -> p@ss,x : the encoded @ and , must not split host or list.
  const { servers, authenticator } = parseQueueUrl('nats://user:p%40ss%2Cx@nats:4222')
  assert.deepStrictEqual(servers, ['nats:4222'])
  assert.deepStrictEqual(authenticator?.(''), { user: 'user', pass: 'p@ss,x' })
})

test('parseQueueUrl treats bare userinfo as a token', () => {
  const { mode, authenticator } = parseQueueUrl('nats://sometoken@nats:4222')
  assert.equal(mode, 'token')
  assert.deepStrictEqual(authenticator?.(''), { auth_token: 'sometoken' })
})

test('parseQueueUrl enables TLS from the tls:// scheme', () => {
  const { tls } = parseQueueUrl('tls://user:pass@nats:4222')
  assert.deepStrictEqual(tls, {})
})

test('parseQueueUrl reads TLS query parameters', () => {
  assert.deepStrictEqual(
    parseQueueUrl('nats://nats:4222?tls=true&tls_insecure=true').tls,
    { rejectUnauthorized: false },
  )
  assert.deepStrictEqual(
    parseQueueUrl('tls://nats:4222?tls_ca_file=/certs/ca.pem').tls,
    { caFile: '/certs/ca.pem' },
  )
})

test('parseQueueUrl splits a cluster list and keeps the first credentials', () => {
  const { servers, mode } = parseQueueUrl('nats://user:pass@h1:4222,h2:4222,h3:4222')
  assert.deepStrictEqual(servers, ['h1:4222', 'h2:4222', 'h3:4222'])
  assert.equal(mode, 'user/pass')
})

test('parseQueueUrl rejects an empty or unparseable url', () => {
  assert.throws(() => parseQueueUrl('   '), /empty/i)
  assert.throws(() => parseQueueUrl('nats://['), /not a valid URL/i)
})
