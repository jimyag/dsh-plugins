import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { TEMPLATES } from './templates.js'
import { isValidMemorySummary, truncateUtf8 } from './codex-format.js'

const execFileAsync = promisify(execFile)
const WORKSPACE_DIFF = 'phase2_workspace_diff.md'
const WORKSPACE_DIFF_MAX_BYTES = 4 * 1024 * 1024
const EXTENSION_RETENTION_DAYS = 14
const BASELINE_MESSAGE = [
  'Initialize Codex git baseline',
  '',
  'Co-authored-by: Codex <noreply@openai.com>',
]

export async function ensureMemoryLayout(root) {
  await mkdir(root, { recursive: true, mode: 0o700 })
  await mkdir(join(root, 'rollout_summaries'), { recursive: true, mode: 0o700 })
  const adHoc = join(root, 'extensions', 'ad_hoc')
  await mkdir(join(adHoc, 'notes'), { recursive: true, mode: 0o700 })
  try {
    await writeFile(join(adHoc, 'instructions.md'), TEMPLATES.adHocInstructions, {
      flag: 'wx',
      mode: 0o600,
    })
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }
}

export async function prepareMemoryWorkspace(root) {
  await ensureMemoryLayout(root)
  await removeWorkspaceDiff(root)
  await ensureGitBaselineRepository(root)
}

export async function ensureGitBaselineRepository(root) {
  if (await usableBaseline(root)) return
  await resetGitBaseline(root)
}

export async function resetGitBaseline(root) {
  await removeWorkspaceDiff(root)
  await rm(join(root, '.git'), { recursive: true, force: true })
  await git(['init', '--quiet'], root)
  await git(['add', '-A'], root)
  await git([
    '-c', 'user.name=Codex',
    '-c', 'user.email=noreply@openai.com',
    '-c', 'commit.gpgsign=false',
    'commit', '--quiet', '--allow-empty',
    '-m', BASELINE_MESSAGE[0],
    '-m', BASELINE_MESSAGE[2],
  ], root)
  await git(['read-tree', '--reset', 'HEAD'], root)
}

export async function memoryWorkspaceDiff(root) {
  await removeWorkspaceDiff(root)
  const indexFile = join(
    root,
    '.git',
    `codex-dsh-index-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  )
  const env = { ...process.env, GIT_INDEX_FILE: indexFile }
  try {
    await git(['read-tree', 'HEAD'], root, env)
    await git(['add', '-A'], root, env)
    const status = await git(['diff', '--cached', '--name-status', '-z', 'HEAD'], root, env)
    const diff = await git([
      'diff', '--cached', '--no-color', '--no-ext-diff', '--unified=3', 'HEAD',
    ], root, env)
    return parseGitDiff(status.stdout, diff.stdout)
  } finally {
    await unlink(indexFile).catch(() => {})
    await unlink(`${indexFile}.lock`).catch(() => {})
  }
}

export async function writeWorkspaceDiff(root, workspaceDiff) {
  const rendered = renderWorkspaceDiff(workspaceDiff)
  await writeFile(join(root, WORKSPACE_DIFF), rendered, { mode: 0o600 })
}

export async function pruneOldExtensionResources(root, now = Date.now()) {
  const extensionsRoot = join(root, 'extensions')
  const cutoff = now - EXTENSION_RETENTION_DAYS * 24 * 60 * 60 * 1000
  let extensions
  try {
    extensions = await readdir(extensionsRoot, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const extension of extensions) {
    if (!extension.isDirectory() || extension.isSymbolicLink()) continue
    const extensionPath = join(extensionsRoot, extension.name)
    if (!existsSync(join(extensionPath, 'instructions.md'))) continue
    let resources
    try {
      resources = await readdir(join(extensionPath, 'resources'), { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    for (const resource of resources) {
      if (!resource.isFile() || resource.isSymbolicLink() || !resource.name.endsWith('.md')) continue
      const timestamp = parseResourceTimestamp(resource.name)
      if (timestamp !== undefined && timestamp <= cutoff) {
        await unlink(join(extensionPath, 'resources', resource.name)).catch((error) => {
          if (error?.code !== 'ENOENT') throw error
        })
      }
    }
  }
}

export async function removeMemorySymlinks(root) {
  let removed = 0
  const directories = [root]
  while (directories.length > 0) {
    const directory = directories.pop()
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const path = join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        await unlink(path)
        removed += 1
      } else if (entry.isDirectory()) {
        directories.push(path)
      }
    }
  }
  return removed
}

export async function validateConsolidationArtifacts(root, version) {
  const removed = await removeMemorySymlinks(root)
  if (removed !== 0) {
    throw new Error(`removed ${removed} symbolic links from consolidated memory workspace`)
  }

  if (version === 'v1') {
    const info = await stat(join(root, 'MEMORY.md'))
    if (!info.isFile()) throw new Error('consolidated MEMORY.md is not a file')
  }

  const summary = await readFile(join(root, 'memory_summary.md'), 'utf8')
  if (!isValidMemorySummary(summary, version)) throw new Error('invalid memory summary artifact')
  return summary
}

export async function readWorkspaceSummary(root) {
  return readFile(join(root, 'memory_summary.md'), 'utf8')
}

export function parseGitDiff(status, diff) {
  const parts = status.split('\0')
  const changes = []
  for (let index = 0; index < parts.length;) {
    const token = parts[index++]
    if (token === '') continue
    const statusCode = token[0]
    const renamed = statusCode === 'R' || statusCode === 'C'
    const path = renamed ? parts[index + 1] : parts[index]
    index += renamed ? 2 : 1
    if (!path) continue
    changes.push({ status: statusCode, path })
  }
  return { changes, unifiedDiff: diff }
}

function renderWorkspaceDiff(diff) {
  const lines = [
    '# Memory Workspace Diff',
    '',
    'Generated by Codex before Phase 2 memory consolidation. Read this file first and do not edit it.',
    '',
    '## Status',
  ]
  if (diff.changes.length === 0) {
    lines.push('- none')
    return `${lines.join('\n')}\n`
  }
  for (const change of diff.changes) {
    lines.push(`- ${change.status} ${change.path}`)
  }
  lines.push('', '## Diff', '', '```diff')
  const bounded = truncateUtf8(diff.unifiedDiff, WORKSPACE_DIFF_MAX_BYTES)
  lines.push(bounded.trimEnd())
  if (bounded !== diff.unifiedDiff) {
    lines.push('', `[workspace diff truncated at ${WORKSPACE_DIFF_MAX_BYTES} bytes]`)
  }
  lines.push('```', '')
  return lines.join('\n')
}

async function usableBaseline(root) {
  if (!existsSync(join(root, '.git'))) return false
  try {
    await git(['rev-parse', '--verify', 'HEAD'], root)
    return true
  } catch {
    return false
  }
}

async function removeWorkspaceDiff(root) {
  await unlink(join(root, WORKSPACE_DIFF)).catch((error) => {
    if (error?.code !== 'ENOENT') throw error
  })
}

async function git(args, cwd, env = process.env) {
  return execFileAsync('git', args, {
    cwd,
    env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  })
}

function parseResourceTimestamp(filename) {
  const value = filename.slice(0, 19)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/.exec(value)
  if (match === null) return undefined
  return Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6]),
  )
}
