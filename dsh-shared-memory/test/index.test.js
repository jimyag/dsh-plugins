import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { apply } from '../src/index.js'

const project = process.cwd()
const tempParent = join(project, 'tmp')
let memoryRoot
let codexHome
let claudeHome
let tools
let exec

before(async () => {
  await mkdir(tempParent, { recursive: true })
  memoryRoot = await mkdtemp(join(tempParent, 'memory-plugin-'))
  codexHome = join(memoryRoot, 'codex')
  claudeHome = join(memoryRoot, 'claude')
  await mkdir(codexHome)
  await mkdir(claudeHome)
  const definitions = new Map()
  const ctx = {
    tools: {
      register(definition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
    workingDirectory: {
      async ensure() {
        return project
      },
    },
  }
  apply(ctx, { root: memoryRoot, codexHome, claudeHome })
  tools = definitions
  exec = {
    agent: {},
    signal: new AbortController().signal,
  }
})

after(async () => {
  await rm(memoryRoot, { recursive: true, force: true })
})

test('registers the shared-memory tools', () => {
  assert.deepEqual(
    [...tools.keys()].sort(),
    [
      'memory_forget',
      'memory_list',
      'memory_pending',
      'memory_read_source',
      'memory_save',
      'memory_search',
    ],
  )
})

test('saves, searches, lists, and forgets a curated memory', async () => {
  const saved = await tools.get('memory_save').execute({
    key: 'plugin-validation',
    title: 'Plugin validation fact',
    content: 'The dsh-shared-memory plugin validated its save/search/list/forget path.',
    source: 'node --test',
    scope: 'project',
  }, exec)
  assert.equal(saved.status, 'saved')
  assert.match(saved.content_hash, /^[0-9a-f]{64}$/)

  const search = await tools.get('memory_search').execute({
    query: 'plugin validation fact',
    limit: 10,
  }, exec)
  assert.equal(search.length, 1)
  assert.equal(search[0].id, saved.id)

  const listed = await tools.get('memory_list').execute({ limit: 10 }, exec)
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, saved.id)

  const forgotten = await tools.get('memory_forget').execute({
    id: saved.id,
    expect_hash: saved.content_hash,
  }, exec)
  assert.equal(forgotten.status, 'forgotten')
})

test('rejects invalid keys before invoking the CLI', async () => {
  await assert.rejects(
    tools.get('memory_save').execute({
      key: 'Not Valid',
      title: 'invalid',
      content: 'invalid',
    }, exec),
    /key must match/,
  )
})

test('reports no pending sources in isolated client homes', async () => {
  const pending = await tools.get('memory_pending').execute({}, exec)
  assert.deepEqual(pending, [])
})

