import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { join } from 'node:path'
import {
  PHASE1_SCHEMAS,
  isValidMemorySummary,
  renderRawMemories,
  rolloutSummaryFilename,
  stableThreadId,
} from '../src/codex-format.js'
import { applyMemoryCitations, createMemoryPipeline } from '../src/pipeline.js'

const project = process.cwd()
const tempParent = join(project, 'tmp')
const oldTime = Date.now() - 8 * 60 * 60 * 1000
let workspace

before(async () => {
  await mkdir(tempParent, { recursive: true })
  workspace = await mkdtemp(join(tempParent, 'pipeline-'))
})

after(async () => {
  await rm(workspace, { recursive: true, force: true })
})

test('matches Codex output schemas, UUIDv7 IDs, filenames, and raw-memory ordering', () => {
  assert.deepEqual(PHASE1_SCHEMAS.v2.required, ['rollout_summary', 'rollout_slug'])
  assert.deepEqual(PHASE1_SCHEMAS.v1.required, ['rollout_summary', 'rollout_slug', 'raw_memory'])

  const state = { sessions: {}, threadIds: {} }
  const first = stableThreadId(state, 'session-old', oldTime)
  const second = stableThreadId(state, 'session-old', oldTime)
  assert.equal(first, second)
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(Number.parseInt(first.replaceAll('-', '').slice(0, 12), 16), oldTime)

  const filename = rolloutSummaryFilename({
    threadId: first,
    sourceUpdatedAt: oldTime,
    rolloutSlug: 'Release Gate / Verified',
  })
  assert.match(
    filename,
    /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[0-9A-Za-z]{4}-release_gate___verified\.md$/,
  )
  assert.equal(
    rolloutSummaryFilename({
      threadId: '01a14509-1913-71e3-b403-c8bbf2d2c4db',
      sourceUpdatedAt: '2026-10-16T15:21:19+00:00',
      rolloutSlug: 'socktrail_zj_performance_fixes_and_push',
    }),
    '2026-10-16T14-06-26-HFi3-socktrail_zj_performance_fixes_and_push.md',
  )

  const raw = renderRawMemories([
    {
      threadId: '019f6e04-934e-7ad3-bc58-547b5ee2919c',
      sourceUpdatedAt: oldTime,
      cwd: '/tmp/z',
      rolloutPath: '/tmp/z.jsonl',
      rolloutSlug: 'z',
      rawMemory: 'z memory',
    },
    {
      threadId: '019e0000-0000-7000-8000-000000000001',
      sourceUpdatedAt: oldTime,
      cwd: '/tmp/a',
      rolloutPath: '/tmp/a.jsonl',
      rolloutSlug: 'a',
      rawMemory: 'a memory',
    },
  ])
  assert.match(raw, /^# Raw Memories\n\nMerged stage-1 raw memories \(stable ascending thread-id order\):/)
  assert.ok(raw.indexOf('## Thread `019e') < raw.indexOf('## Thread `019f'))
})

test('validates the v2 summary contract', () => {
  const valid = [
    'v1',
    '## User Profile',
    '## User preferences',
    '## General Tips',
    "## What's in Memory",
  ].join('\n')
  assert.equal(isValidMemorySummary(valid, 'v2'), true)
  assert.equal(isValidMemorySummary(valid.replace('v1', 'v2'), 'v2'), false)
  assert.equal(isValidMemorySummary(valid.replace('## General Tips', ''), 'v2'), false)
  assert.equal(isValidMemorySummary(`${valid}\n${'x'.repeat(10_000)}`, 'v2'), false)
})

test('updates usage counts once per cited assistant response', () => {
  const threadId = '019f6e04-934e-7ad3-bc58-547b5ee2919c'
  const state = {
    sessions: {
      [threadId]: { status: 'succeeded', usageCount: 0, lastUsage: null },
    },
    citationWatermarks: {},
  }
  const snapshot = {
    events: [{
      type: 'assistant/message',
      seq: 7,
      data: {
        role: 'assistant',
        content: [{
          type: 'text',
          text: [
            'Answer.',
            '<oai-mem-citation>',
            '<citation_entries>',
            `rollout_summaries/test.md:1-2|note=[used prior context]`,
            '</citation_entries>',
            '<rollout_ids>',
            threadId,
            '</rollout_ids>',
            '</oai-mem-citation>',
          ].join('\n'),
        }],
      },
    }],
  }
  assert.equal(applyMemoryCitations(state, 'session-citing', snapshot, oldTime), true)
  assert.equal(state.sessions[threadId].usageCount, 1)
  assert.equal(state.citationWatermarks['session-citing'], 7)
  assert.equal(applyMemoryCitations(state, 'session-citing', snapshot, oldTime), false)
  assert.equal(state.sessions[threadId].usageCount, 1)
})

test('runs Codex v2 phase 1 and workspace phase 2, then skips a no-op startup', async () => {
  const fixture = await createFixture('v2')
  await fixture.pipeline.start(fixture.parent)

  assert.equal(fixture.calls.length, 2)
  assert.equal(fixture.calls[0].label, 'codex-memory phase 1')
  assert.equal(fixture.calls[1].label, 'codex-memory phase 2')
  assert.equal(fixture.calls[0].request.outputSchema, PHASE1_SCHEMAS.v2)
  assert.equal(fixture.calls[1].request.outputSchema, undefined)
  assert.match(fixture.calls[0].request.prompt[0].text, /rollout_primary_git_branch_hint/)
  assert.doesNotMatch(fixture.calls[0].request.prompt[0].text, /Injected workspace instructions/)
  assert.match(fixture.calls[1].request.prompt[0].text, /phase2_workspace_diff.md/)

  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  const entry = Object.values(state.sessions)[0]
  assert.equal(entry.status, 'succeeded')
  assert.equal(entry.rawMemory, '')
  assert.equal(entry.selectedForPhase2, true)
  assert.equal(state.threadIds['session-old'], entry.threadId)

  const summary = await readFile(join(fixture.root, 'memory_summary.md'), 'utf8')
  assert.equal(isValidMemorySummary(summary, 'v2'), true)
  const rollout = await readFile(join(fixture.root, 'rollout_summaries', rolloutSummaryFilename(entry)), 'utf8')
  assert.match(rollout, new RegExp(`^thread_id: ${entry.threadId}\\n`))
  assert.match(rollout, /\nupdated_at: .*\+00:00\n/)
  assert.ok(rollout.includes(`\nrollout_path: ${fixture.rolloutPath}\n`))
  assert.match(rollout, /\n- Verified the release gate\./)
  assert.doesNotMatch(rollout, /Raw memory/)
  assert.ok((await readdir(join(fixture.root, 'rollout_summaries'))).includes('codex-owned.md'))
  assert.deepEqual(state.ownedRolloutFiles, [rolloutSummaryFilename(entry)])
  await assert.rejects(readFile(join(fixture.root, 'MEMORY.md'), 'utf8'), { code: 'ENOENT' })
  await assert.rejects(readFile(join(fixture.root, 'raw_memories.md'), 'utf8'), { code: 'ENOENT' })
  assert.match(fixture.summaryCache.get(fixture.root), /release gate is verified/i)

  const callsAfterFirstRun = fixture.calls.length
  await fixture.pipeline.start(fixture.parent)
  assert.equal(fixture.calls.length, callsAfterFirstRun)
})

test('consolidates a new ad-hoc note through the workspace diff', async () => {
  const fixture = await createFixture('v2')
  await fixture.pipeline.start(fixture.parent)
  const notePath = join(
    fixture.root,
    'extensions',
    'ad_hoc',
    'notes',
    '2026-10-26T00-00-00-note-test.md',
  )
  await writeFile(notePath, 'Remember that ad-hoc notes are consolidated.\n')
  const before = fixture.calls.length
  await fixture.pipeline.start(fixture.parent)
  assert.equal(fixture.calls.length, before + 1)
  assert.match(fixture.lastDiff, /ad_hoc\/notes\/2026-10-26T00-00-00-note-test\.md/)
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  assert.ok(state.processedNotes['extensions/ad_hoc/notes/2026-10-26T00-00-00-note-test.md'])
})

test('writes V1 MEMORY.md, sorted raw_memories.md, and rollout summaries', async () => {
  const fixture = await createFixture('v1')
  await fixture.pipeline.start(fixture.parent)

  const memory = await readFile(join(fixture.root, 'MEMORY.md'), 'utf8')
  const summary = await readFile(join(fixture.root, 'memory_summary.md'), 'utf8')
  const raw = await readFile(join(fixture.root, 'raw_memories.md'), 'utf8')
  const state = JSON.parse(await readFile(fixture.statePath, 'utf8'))
  const entry = Object.values(state.sessions)[0]

  assert.match(memory, /# Memory/)
  assert.match(summary, /^v1\n/)
  assert.match(raw, /^# Raw Memories/m)
  assert.match(raw, new RegExp(`## Thread \`${entry.threadId}\``))
  assert.match(raw, /release gate is verified/)
  assert.match(raw, new RegExp(`rollout_summary_file: ${rolloutSummaryFilename(entry)}`))
  assert.deepEqual(await readdir(join(fixture.root, 'rollout_summaries')), [rolloutSummaryFilename(entry)])
})

test('refuses to overwrite an unmanaged shared V1 raw_memories.md', async () => {
  const fixture = await createFixture('v1')
  const rawPath = join(fixture.root, 'raw_memories.md')
  await writeFile(rawPath, '# Raw Memories\n\nCodex-owned content.\n')
  await fixture.pipeline.start(fixture.parent)
  assert.equal(fixture.calls.length, 1)
  assert.equal(await readFile(rawPath, 'utf8'), '# Raw Memories\n\nCodex-owned content.\n')
})

async function createFixture(version) {
  const id = `${version}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const base = join(workspace, id)
  const root = join(base, 'memories_v2')
  const dshHome = join(base, 'dsh')
  const statePath = join(base, 'state.json')
  const lockPath = join(base, 'pipeline.lock')
  await mkdir(root, { recursive: true })
  const initialSummary = version === 'v2'
    ? validV2Summary('Initial profile.')
    : 'v1\n\n## User Profile\n\nInitial profile.\n'
  await writeFile(join(root, 'memory_summary.md'), initialSummary)
  if (version === 'v2') {
    await mkdir(join(root, 'rollout_summaries'), { recursive: true })
    await writeFile(join(root, 'rollout_summaries', 'codex-owned.md'), 'thread_id: 019f6e04-934e-7ad3-bc58-547b5ee2919c\n')
  }
  if (version === 'v1') await writeFile(join(root, 'MEMORY.md'), '# Memory\n\n## Facts\n\n- Initial.\n')

  const rolloutPath = join(
    dshHome,
    'sessions',
    `--${project.replaceAll('/', '-')}--`,
    'session-old',
    'session.v4.jsonl.zstd',
  )
  await mkdir(join(rolloutPath, '..'), { recursive: true })
  await writeFile(rolloutPath, '')

  const sessionQuery = {
    async listSessions() {
      return [{
        header: {
          id: 'session-old',
          createdAt: oldTime,
          cwd: project,
          isSeeded: false,
        },
        live: false,
        persisted: true,
      }]
    },
    async readSession() {
      return {
        session: {
          id: 'session-old',
          createdAt: oldTime,
          cwd: project,
          isSeeded: false,
        },
        events: [
          {
            type: 'user/message',
            seq: 1,
            time: oldTime + 500,
            data: {
              role: 'user',
              source: { kind: 'agent-instructions' },
              content: [{ type: 'text', text: 'Injected workspace instructions must not be extracted.' }],
            },
          },
          {
            type: 'user/message',
            seq: 2,
            time: oldTime + 1000,
            data: {
              role: 'user',
              source: { kind: 'user' },
              content: [{ type: 'text', text: 'The release gate is verified.' }],
            },
          },
          {
            type: 'assistant/message',
            seq: 3,
            time: oldTime + 2000,
            data: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Noted.' }],
            },
          },
        ],
      }
    },
  }

  const calls = []
  const fixture = {
    calls,
    dshHome,
    root,
    rolloutPath,
    statePath,
    summaryCache: new Map(),
    lastDiff: '',
  }
  const subagents = {
    getProvider() {
      return {}
    },
    async startActivation(spec) {
      calls.push(spec)
      if (spec.label === 'codex-memory phase 1') {
        const structured = version === 'v2'
          ? {
              rollout_summary: '- Verified the release gate.\n- Recorded the validation result.',
              rollout_slug: 'Release Gate',
            }
          : {
              raw_memory: 'The release gate is verified. The evidence came from session-old.',
              rollout_summary: '- Verified the release gate.\n- Recorded the validation result.',
              rollout_slug: 'Release Gate',
            }
        return {
          result: Promise.resolve({ stopReason: 'completed', structured }),
          async dispose() {},
        }
      }

      fixture.lastDiff = await readFile(join(root, 'phase2_workspace_diff.md'), 'utf8')
      if (version === 'v2') {
        await writeFile(join(root, 'memory_summary.md'), validV2Summary('The release gate is verified.'))
      } else {
        await writeFile(join(root, 'MEMORY.md'), '# Memory\n\n## Facts\n\n- The release gate is verified.\n')
        await writeFile(join(root, 'memory_summary.md'), 'v1\n\nThe release gate is verified.\n')
      }
      return {
        result: Promise.resolve({ stopReason: 'completed', output: [{ type: 'text', text: 'done' }] }),
        async dispose() {},
      }
    },
  }

  const parent = {
    id: 'session-root',
    session: { header: { cwd: project } },
    options: {},
  }
  const ctx = {
    agents: {
      get(candidate) {
        return candidate === parent.id ? parent : undefined
      },
    },
    get(name) {
      if (name === 'subagents') return subagents
      if (name === 'sessionQuery') return sessionQuery
      return undefined
    },
    logger: {
      info() {},
      warn(...args) {
        if (process.env.DEBUG_TESTS) console.error(...args)
      },
    },
  }
  fixture.parent = parent
  fixture.pipeline = createMemoryPipeline({
    ctx,
    options: {
      root,
      version,
      dshHome,
      autoGenerate: true,
      statePath,
      lockPath,
      workspaceLockPath: join(base, 'memories_v2.lock'),
      maxScanSessions: 10,
      maxRolloutsPerStartup: 1,
      minRolloutIdleHours: 6,
      maxRolloutAgeDays: 10,
      maxUnusedDays: 30,
      maxRawMemoriesForConsolidation: 10,
      phase1Concurrency: 1,
      maxSessionChars: 20_000,
      phase1MaxTokens: 4_000,
      phase2MaxTokens: 8_000,
      phase1Model: undefined,
      consolidationModel: undefined,
      phase1ReasoningEffort: undefined,
      phase2ReasoningEffort: undefined,
      subagentProvider: 'spawn',
    },
    summaryCache: fixture.summaryCache,
  })
  return fixture
}

function validV2Summary(profile) {
  return [
    'v1',
    '',
    '## User Profile',
    '',
    profile,
    '',
    '## User preferences',
    '',
    '- None yet.',
    '',
    '## General Tips',
    '',
    '- None yet.',
    '',
    "## What's in Memory",
    '',
    '- Initial.',
    '',
  ].join('\n')
}
