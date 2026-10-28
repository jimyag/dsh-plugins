import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

const execFileAsync = promisify(execFile)
const providerName = '@deepseek-ai/dsh-experimental-cua-macos'
const { entry, manifest, root } = await locateProvider()
const provider = await import(entry)

export const Config = provider.Config
export const inject = provider.inject
export const name = 'dsh-cua-macos'

export async function apply(ctx, rawConfig) {
  const config = provider.Config(rawConfig)
  const helperPath = await prepareNativeHelper(root, manifest.version, config.buildTimeoutMs)
  await provider.apply(ctx, { ...config, helperPath })
}

async function locateProvider() {
  const resolvers = [createRequire(import.meta.url)]
  for (const profile of profileCandidates()) {
    resolvers.push(createRequire(join(profile, 'package.json')))
  }

  let manifestPath
  for (const resolveFrom of resolvers) {
    try {
      manifestPath = resolveFrom.resolve(`${providerName}/package.json`)
      break
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND' && error.code !== 'ERR_MODULE_NOT_FOUND') throw error
    }
  }
  if (!manifestPath) {
    throw new Error(
      `Cannot locate ${providerName}. Reinstall dsh-cua-macos so its source dependency is downloaded.`,
    )
  }

  const providerRoot = dirname(manifestPath)
  const providerManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const main = providerManifest.main ?? 'lib/index.js'
  return {
    entry: pathToFileURL(resolve(providerRoot, main)).href,
    manifest: providerManifest,
    root: providerRoot,
  }
}

function profileCandidates() {
  const candidates = new Set()
  if (process.env.DSH_PROFILE_DIR) candidates.add(resolve(process.env.DSH_PROFILE_DIR))
  if (process.env.DSH_HOME && process.env.DSH_PROFILE) {
    candidates.add(resolve(process.env.DSH_HOME, 'profiles', process.env.DSH_PROFILE))
  }
  for (const argument of process.argv) {
    if (!argument.startsWith('/')) continue
    const candidate = resolve(argument)
    if (basename(dirname(candidate)) === 'profiles') candidates.add(candidate)
  }
  return candidates
}

async function prepareNativeHelper(providerRoot, providerVersion, timeoutMs) {
  if (process.platform !== 'darwin') {
    throw new Error('dsh-cua-macos requires macOS')
  }
  if (process.arch !== 'arm64' && process.arch !== 'x64') {
    throw new Error(`Unsupported macOS architecture: ${process.arch}`)
  }

  const cacheRoot =
    process.env.DSH_CUA_CACHE_DIR ??
    join(homedir(), 'Library', 'Caches', 'dsh-cua-macos')
  const version = providerVersion.replace(/[^a-zA-Z0-9._-]/g, '_')
  const target = join(cacheRoot, version, process.arch)
  const helperPath = join(target, 'dsh-cua-native')
  try {
    await access(helperPath, constants.X_OK)
    return helperPath
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  await mkdir(target, { recursive: true })
  const scratch = join(target, `.build-${process.pid}-${randomUUID()}`)
  const temporary = join(target, `.dsh-cua-native-${process.pid}-${randomUUID()}`)
  const architecture = process.arch === 'x64' ? 'x86_64' : 'arm64'
  try {
    await execFileAsync(
      '/usr/bin/xcrun',
      [
        'swift',
        'build',
        '--package-path',
        join(providerRoot, 'native'),
        '--scratch-path',
        scratch,
        '--configuration',
        'release',
        '--product',
        'dsh-cua-native',
        '--arch',
        architecture,
      ],
      { cwd: providerRoot, maxBuffer: 10 * 1024 * 1024, timeout: timeoutMs },
    )
    await copyFile(join(scratch, 'release', 'dsh-cua-native'), temporary)
    await chmod(temporary, 0o755)
    await rename(temporary, helperPath)
    return helperPath
  } catch (error) {
    const detail = error.stderr?.trim() || error.stdout?.trim() || error.message
    throw new Error(
      `Failed to build dsh-cua-native. Install Xcode Command Line Tools with "xcode-select --install" and retry: ${detail}`,
      { cause: error },
    )
  } finally {
    await rm(temporary, { force: true }).catch(() => {})
    await rm(scratch, { recursive: true, force: true }).catch(() => {})
  }
}
