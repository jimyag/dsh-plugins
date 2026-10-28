import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { apply } from '../src/index.js'

const project = process.cwd()
const tempParent = join(project, 'tmp')
let root
let tools
let exec

before(async () => {
  await mkdir(tempParent, { recursive: true })
  root = await mkdtemp(join(tempParent, 'codex-memory-'))
  await writeFile(join(root, 'memory_summary.md'), '## User Profile\nTest profile.\n')
  await writeFile(join(root, 'MEMORY.md'), '## Notes\nrelease gate is verified.\n')
  const definitions = new Map()
  const ctx = {
    tools: {
      register(definition) {
        definitions.set(definition.name, definition)
        return () => definitions.delete(definition.name)
      },
    },
    agents: {
      list() {
        return []
      },
    },
    systemPrompt: {},
    on() {},
    effect() {},
    logger: { warn() {} },
  }
  apply(ctx, { root, autoInject: false })
  tools = definitions
  exec = {
    agent: {},
    signal: new AbortController().signal,
  }
})

after(async () => {
  await rm(root, { recursive: true, force: true })
})

test('registers Codex-compatible memory tools', () => {
  assert.deepEqual(
    [...tools.keys()].sort(),
    [
      'codex_memory_list',
      'codex_memory_note',
      'codex_memory_read',
      'codex_memory_search',
    ],
  )
})

test('searches, lists, and reads memory files', async () => {
  const search = await tools.get('codex_memory_search').execute({
    query: 'release gate',
  }, exec)
  assert.equal(search.matches.length, 1)
  assert.equal(search.matches[0].path, 'MEMORY.md')
  assert.equal(search.matches[0].line_number, 2)

  const list = await tools.get('codex_memory_list').execute({}, exec)
  assert.deepEqual(list.map(item => item.path), ['MEMORY.md', 'memory_summary.md'])

  const read = await tools.get('codex_memory_read').execute({
    path: 'MEMORY.md',
  }, exec)
  assert.equal(read.content, '## Notes\nrelease gate is verified.\n')
})

test('creates one append-only ad-hoc note', async () => {
  const saved = await tools.get('codex_memory_note').execute({
    slug: 'memory-test',
    note: 'Remember this validation fact.',
  }, exec)
  assert.equal(saved.status, 'saved')
  assert.match(
    saved.path,
    /^extensions\/ad_hoc\/notes\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-memory-test\.md$/,
  )
})

test('rejects path traversal', async () => {
  await assert.rejects(
    tools.get('codex_memory_read').execute({ path: '../outside.md' }, exec),
    /memory path escapes root/,
  )
})

test('injects the memory summary into root agents only', async () => {
  const listeners = new Map()
  const sections = []
  const ctx = {
    tools: { register() {} },
    agents: { list() { return [] } },
    systemPrompt: {},
    on(event, callback) { listeners.set(event, callback) },
    effect() {},
    logger: { warn() {} },
  }
  apply(ctx, { root })

  const rootAgent = {
    id: 'root-agent',
    session: { header: { cwd: project } },
    ctx: {
      systemPrompt: {
        section(definition) {
          sections.push(definition)
          return () => {}
        },
      },
    },
  }
  await listeners.get('agent/created')({ agent: rootAgent, signal: new AbortController().signal })
  assert.equal(sections.length, 1)
  assert.match(sections[0].text(), /Test profile/)

  const childAgent = {
    id: 'child-agent',
    session: { header: { cwd: project, parentSession: 'root-agent', origin: 'subagent' } },
    ctx: {
      systemPrompt: {
        section(definition) {
          sections.push(definition)
          return () => {}
        },
      },
    },
  }
  await listeners.get('agent/created')({ agent: childAgent, signal: new AbortController().signal })
  assert.equal(sections.length, 1)
})

