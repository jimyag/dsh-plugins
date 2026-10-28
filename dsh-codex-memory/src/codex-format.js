import { createHash } from 'node:crypto'

const BASE62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const SHORT_HASH_SPACE = 14_776_336
const ROLLOUT_SLUG_MAX_LEN = 60
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const PHASE1_SCHEMAS = Object.freeze({
  v1: {
    type: 'object',
    properties: {
      rollout_summary: { type: 'string' },
      rollout_slug: { type: ['string', 'null'] },
      raw_memory: { type: 'string' },
    },
    required: ['rollout_summary', 'rollout_slug', 'raw_memory'],
    additionalProperties: false,
  },
  v2: {
    type: 'object',
    properties: {
      rollout_summary: { type: 'string' },
      rollout_slug: { type: 'string' },
    },
    required: ['rollout_summary', 'rollout_slug'],
    additionalProperties: false,
  },
})

export function stableThreadId(state, dshSessionId, createdAt) {
  if (UUID_V7.test(dshSessionId)) return dshSessionId.toLowerCase()

  const migrated = Object.values(state.sessions ?? {}).find(
    (entry) => entry?.dshSessionId === dshSessionId && UUID_V7.test(entry.threadId ?? ''),
  )
  if (migrated !== undefined) {
    state.threadIds ??= {}
    state.threadIds[dshSessionId] = migrated.threadId
    return migrated.threadId
  }

  state.threadIds ??= {}
  const existing = state.threadIds[dshSessionId]
  if (UUID_V7.test(existing ?? '')) return existing.toLowerCase()

  for (let attempt = 0; ; attempt += 1) {
    const candidate = uuidV7(dshSessionId, createdAt, attempt)
    const collision = Object.entries(state.threadIds).some(
      ([sessionId, threadId]) => sessionId !== dshSessionId && threadId === candidate,
    )
    if (collision) continue
    state.threadIds[dshSessionId] = candidate
    return candidate
  }
}

export function uuidV7(seed, createdAt, attempt = 0) {
  const bytes = new Uint8Array(16)
  let timestamp = BigInt(Math.max(0, Math.trunc(Number(createdAt) || 0)))
  timestamp &= (1n << 48n) - 1n
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(timestamp & 0xffn)
    timestamp >>= 8n
  }

  const digest = createHash('sha256').update(`codex-dsh-thread:${seed}:${attempt}`).digest()
  bytes[6] = 0x70 | (digest[0] & 0x0f)
  bytes[7] = digest[1]
  bytes[8] = 0x80 | (digest[2] & 0x3f)
  for (let index = 9; index < 16; index += 1) bytes[index] = digest[index - 1]
  return formatUuid(bytes)
}

export function normalizeRolloutSlug(value) {
  let slug = ''
  for (const character of String(value ?? '')) {
    if (slug.length >= ROLLOUT_SLUG_MAX_LEN) break
    slug += /[A-Za-z0-9]/.test(character) ? character.toLowerCase() : '_'
  }
  return slug.replace(/_+$/g, '')
}

export function rolloutSummaryFileStem(entry) {
  const threadId = String(entry.threadId ?? '')
  const sourceUpdatedAt = toMillis(entry.sourceUpdatedAt)
  const timestamp = UUID.test(threadId) ? uuidTimestampMillis(threadId) ?? sourceUpdatedAt : sourceUpdatedAt
  const timestampFragment = formatTimestampFragment(timestamp)
  const seed = UUID.test(threadId)
    ? Number.parseInt(threadId.slice(-8), 16) >>> 0
    : rollingHash(threadId)
  const shortHash = encodeShortHash(seed)
  const prefix = `${timestampFragment}-${shortHash}`
  const slug = normalizeRolloutSlug(entry.rolloutSlug)
  return slug === '' ? prefix : `${prefix}-${slug}`
}

export function rolloutSummaryFilename(entry) {
  return `${rolloutSummaryFileStem(entry)}.md`
}

export function renderRolloutSummary(entry) {
  const lines = [
    `thread_id: ${entry.threadId}`,
    `updated_at: ${rfc3339(entry.sourceUpdatedAt)}`,
    `rollout_path: ${entry.rolloutPath}`,
    `cwd: ${entry.cwd}`,
  ]
  if (entry.gitBranch) lines.push(`git_branch: ${entry.gitBranch}`)
  lines.push('', String(entry.rolloutSummary ?? '').trim(), '')
  return lines.join('\n')
}

export function renderRawMemories(entries) {
  const retained = [...entries].sort((left, right) => left.threadId.localeCompare(right.threadId))
  if (retained.length === 0) {
    return '# Raw Memories\n\nNo raw memories yet.\n'
  }

  const sections = ['# Raw Memories', '', 'Merged stage-1 raw memories (stable ascending thread-id order):', '']
  for (const entry of retained) {
    sections.push(
      `## Thread \`${entry.threadId}\``,
      `updated_at: ${rfc3339(entry.sourceUpdatedAt)}`,
      `cwd: ${entry.cwd}`,
      `rollout_path: ${entry.rolloutPath}`,
      `rollout_summary_file: ${rolloutSummaryFilename(entry)}`,
      '',
      String(entry.rawMemory ?? '').trim(),
      '',
    )
  }
  return `${sections.join('\n').trimEnd()}\n`
}

export function isValidMemorySummary(summary, version) {
  const text = String(summary ?? '')
  if (text.split(/\r?\n/, 1)[0] !== 'v1') return false
  if (version === 'v1') return true
  if (Buffer.byteLength(text, 'utf8') >= 10_000) return false
  const headings = new Set(text.split(/\r?\n/).map((line) => line.trim()))
  return [
    '## User Profile',
    '## User preferences',
    '## General Tips',
    "## What's in Memory",
  ].every((heading) => headings.has(heading))
}

export function rfc3339(value) {
  return new Date(toMillis(value)).toISOString().replace(/\.\d{3}Z$/, '+00:00')
}

export function toMillis(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : 0
}

export function truncateUtf8(value, maxBytes) {
  const text = String(value ?? '')
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) return text
  let bytes = 0
  let output = ''
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8')
    if (bytes + size > maxBytes) break
    bytes += size
    output += character
  }
  return output
}

function uuidTimestampMillis(threadId) {
  const hex = threadId.replaceAll('-', '').slice(0, 12)
  return Number.parseInt(hex, 16)
}

function formatTimestampFragment(value) {
  return new Date(value).toISOString().slice(0, 19).replaceAll(':', '-')
}

function rollingHash(value) {
  let hash = 0
  for (const byte of Buffer.from(value)) {
    hash = Math.imul(hash, 31)
    hash = (hash + byte) >>> 0
  }
  return hash
}

function encodeShortHash(seed) {
  let value = seed % SHORT_HASH_SPACE
  const chars = Array(4).fill('0')
  for (let index = 3; index >= 0; index -= 1) {
    chars[index] = BASE62[value % BASE62.length]
    value = Math.floor(value / BASE62.length)
  }
  return chars.join('')
}

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString('hex')
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-')
}
