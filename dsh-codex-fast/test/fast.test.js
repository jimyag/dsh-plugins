import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createServer } from 'node:http'
import test from 'node:test'
import { createFastFetch, isGptModel, withRequestScope } from '../src/transport.js'

async function receiver() {
  const calls = []
  const server = createServer(async (request, response) => {
    let text = ''
    for await (const chunk of request) text += chunk
    calls.push({ path: request.url, headers: request.headers, body: JSON.parse(text) })
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  return { base, calls, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }) }
}

test('all GPT route forms are recognized, while other model families are excluded', () => {
  for (const model of ['gpt-4o', 'gpt-6.1-sol', 'codex/gpt-6.1-sol', 'workbuddy-ai/gpt-6.1-sol', 'group/auto-gpt-6-1-sol', 'remote-magpie/workbuddy-ai/GPT-6.1-Sol']) assert.equal(isGptModel(model), true, model)
  for (const model of ['deepseek-v4.1-flash', 'group/auto-deepseek-v4-1-flash', 'kimi/k3', 'claude/opus', undefined]) assert.equal(isGptModel(model), false, model)
})

test('real HTTP wire preserves reasoning and replay while isolating concurrent session on/off', async () => {
  const server = await receiver()
  const storage = new AsyncLocalStorage()
  const enabled = new Set(['session-a'])
  const wrapped = createFastFetch(fetch, () => storage.getStore())
  const payload = { model: 'codex/gpt-6.1-sol', reasoning: { effort: 'high' }, include: ['reasoning.encrypted_content'], input: [{ type: 'reasoning', encrypted_content: 'sealed-reasoning' }], stream: true }
  const send = id => storage.run({ sessionId: id, model: payload.model, target: new URL(server.base + '/v1/responses'), enabled: enabled.has(id) }, () => wrapped(server.base + '/v1/responses', { method: 'POST', headers: { 'content-type': 'application/json', 'x-test-session': id, 'x-test-preserve': 'yes' }, body: JSON.stringify(payload) }))
  try {
    await Promise.all([send('session-a'), send('session-b')])
    assert.deepEqual(server.calls.find(c => c.headers['x-test-session'] === 'session-a').body, { ...payload, service_tier: 'priority' })
    assert.deepEqual(server.calls.find(c => c.headers['x-test-session'] === 'session-b').body, payload)
    enabled.delete('session-a')
    await send('session-a')
    assert.deepEqual(server.calls.at(-1).body, payload)
    assert.equal(server.calls[0].headers['x-test-preserve'], 'yes')
    assert.equal(payload.service_tier, undefined)
    assert.equal(storage.getStore(), undefined)
  } finally { wrapped.dispose(); await server.close() }
})

test('lazy Chat streams keep session context without session HTTP headers, including cancellation', async () => {
  const server = await receiver()
  const storage = new AsyncLocalStorage()
  const wrapped = createFastFetch(fetch, () => storage.getStore())
  const payload = { model: 'workbuddy-ai/gpt-6.1-sol', reasoning_effort: 'high', messages: [{ role: 'user', content: 'test' }] }
  let cleanedIn
  const stream = withRequestScope(storage, { sessionId: 'session-a', enabled: true, model: payload.model, target: new URL(server.base + '/v1/chat/completions') }, async function* () {
    try {
      await Promise.resolve()
      await wrapped(new Request(server.base + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }))
      yield 'response'
      yield 'unused'
    } finally { cleanedIn = storage.getStore()?.sessionId }
  })
  try {
    assert.equal((await stream.next()).value, 'response')
    assert.deepEqual(server.calls[0].body, { ...payload, service_tier: 'priority' })
    await stream.return()
    assert.equal(cleanedIn, 'session-a')
    assert.equal(storage.getStore(), undefined)
  } finally { wrapped.dispose(); await server.close() }
})

test('foreign endpoints, mismatched models and requests outside LLM context pass through', async () => {
  const local = await receiver()
  const foreign = await receiver()
  const storage = new AsyncLocalStorage()
  const wrapped = createFastFetch(fetch, () => storage.getStore())
  const gpt = { model: 'codex/gpt-6.1-sol', input: [] }
  const scope = { sessionId: 'session-a', enabled: true, model: gpt.model, target: new URL(local.base + '/v1/responses') }
  const send = (base, path, payload) => wrapped(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  try {
    await storage.run(scope, () => send(foreign.base, '/v1/responses', gpt))
    await storage.run(scope, () => send(local.base, '/another/responses', gpt))
    await storage.run(scope, () => send(local.base, '/v1/responses', { model: 'deepseek-v4.1-flash', input: [] }))
    await send(local.base, '/v1/responses', gpt)
    assert.deepEqual(foreign.calls[0].body, gpt)
    for (const call of local.calls) assert.equal(call.body.service_tier, undefined)
  } finally { wrapped.dispose(); await local.close(); await foreign.close() }
})

test('consumer errors preserve iterator cleanup context without leaking it', async () => {
  const storage = new AsyncLocalStorage()
  let cleanedIn
  const stream = withRequestScope(storage, { sessionId: 'session-a' }, async function* () { try { yield 1 } finally { cleanedIn = storage.getStore()?.sessionId } })
  await stream.next()
  const failure = new Error('consumer stopped')
  await assert.rejects(stream.throw(failure), error => error === failure)
  assert.equal(cleanedIn, 'session-a')
  assert.equal(storage.getStore(), undefined)
})

test('disposed request hooks remain transparent for already-created SDK clients', async () => {
  const init = { method: 'POST', signal: new AbortController().signal, body: 'not-json' }
  const wrapped = createFastFetch(async (input, options) => { assert.equal(input, 'http://127.0.0.1:3425/v1/responses'); assert.equal(options, init); return new Response('ok') }, () => { throw new Error('disposed storage must not be accessed') })
  wrapped.dispose()
  await wrapped('http://127.0.0.1:3425/v1/responses', init)
})
