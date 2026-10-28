import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply } from '../src/index.js'

function createHarness(binary = '/bin/echo') {
  const definitions = new Map()
  const ctx = {
    tools: {
      register(definition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
    systemPrompt: {
      section() {
        return () => {}
      },
    },
    effect(register) {
      return register()
    },
  }
  apply(ctx, { binary })
  return definitions.get('ego_browser')
}

const exec = { signal: new AbortController().signal }

test('registers an active ego_browser tool', () => {
  const tool = createHarness()
  assert.equal(tool.name, 'ego_browser')
})

test('maps version and run actions to the CLI', async () => {
  const tool = createHarness()
  const version = await tool.execute({ action: 'version' }, exec)
  assert.equal(version.stdout.trim(), '--version')

  const run = await tool.execute({ action: 'run', script: 'console.log("ok")' }, exec)
  assert.equal(run.stdout.trim(), 'nodejs')
})

test('sends the browser script over stdin and closes it', async () => {
  const tool = createHarness(fileURLToPath(new URL('../test-support/wait-for-eof.js', import.meta.url)))
  const result = await tool.execute({
    action: 'run',
    script: 'console.log("ok")',
    timeout_ms: 1000,
  }, exec)
  assert.equal(result.stdout, 'console.log("ok")')
})

test('rejects invalid action-specific arguments before spawning', async () => {
  const tool = createHarness()
  await assert.rejects(
    tool.execute({ action: 'run' }, exec),
    /script must be a non-empty string/,
  )
  await assert.rejects(
    tool.execute({ action: 'version', script: 'ignored' }, exec),
    /script is not valid for action=version/,
  )
})
