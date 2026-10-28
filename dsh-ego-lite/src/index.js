import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_TIMEOUT_MS = 600_000
const MAX_SCRIPT_BYTES = 1024 * 1024
const HELP_TOPIC = /^[a-z0-9][a-z0-9._ -]{0,79}$/i

const RESULT_OUTPUT = {
  schema: {
    type: 'object',
    properties: {
      action: { type: 'string' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
    },
    required: ['action', 'stdout', 'stderr'],
    additionalProperties: false,
  },
  render(_args, value) {
    const text = [value.stdout.trimEnd(), value.stderr.trimEnd()].filter(Boolean).join('\n\n')
    return [{ type: 'text', text: text || '(no output)' }]
  },
}

export const name = 'dsh-ego-lite'
export const inject = ['tools', 'systemPrompt']

/**
 * Register one model-callable tool over the ego-browser CLI.
 * Task spaces and tabs persist in ego lite; JavaScript process state does not.
 */
export function apply(ctx, config = {}) {
  const options = resolveOptions(config)

  ctx.tools.register({
    name: 'ego_browser',
    description: 'Run ego lite browser automation. Use this for websites, logged-in sessions, clicking, forms, extraction, screenshots, downloads, and web-app testing. Call action="skill" before the first browser task and follow the returned guide. action="run" executes one complete top-level-await JavaScript round through ego-browser nodejs; task spaces and tabs persist across calls, process variables do not. Use action="help" for an API topic, or action="version" to inspect the installed runtime.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['skill', 'help', 'version', 'run'],
          description: 'skill prints the version-matched guide, help prints a CLI/API topic, version prints the runtime version, run executes script.',
        },
        topic: {
          type: 'string',
          description: 'Optional help topic, such as "page.click", "nodejs", or "profiles". Used only with action="help".',
        },
        script: {
          type: 'string',
          description: 'Complete ego-browser Node.js script. Top-level await is supported. Used only with action="run".',
        },
        timeout_ms: {
          type: 'integer',
          minimum: 1000,
          maximum: MAX_TIMEOUT_MS,
          description: 'Maximum execution time. Defaults to 120000.',
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    output: RESULT_OUTPUT,
    async execute(args, exec) {
      const input = objectArgs(args)
      const action = requiredEnum(input.action, 'action', ['skill', 'help', 'version', 'run'])
      const timeoutMs = optionalInteger(input.timeout_ms, 'timeout_ms', DEFAULT_TIMEOUT_MS, 1000, MAX_TIMEOUT_MS)
      let command
      let stdin

      if (action === 'skill') {
        rejectField(input.topic, 'topic', action)
        rejectField(input.script, 'script', action)
        command = ['skill']
      } else if (action === 'help') {
        rejectField(input.script, 'script', action)
        const topic = input.topic === undefined ? undefined : requiredString(input.topic, 'topic')
        if (topic !== undefined && !HELP_TOPIC.test(topic)) throw new Error('topic contains unsupported characters')
        command = topic === undefined ? ['help'] : ['help', topic]
      } else if (action === 'version') {
        rejectField(input.topic, 'topic', action)
        rejectField(input.script, 'script', action)
        command = ['--version']
      } else {
        rejectField(input.topic, 'topic', action)
        const script = requiredString(input.script, 'script')
        if (Buffer.byteLength(script) > MAX_SCRIPT_BYTES) {
          throw new Error(`script must be at most ${MAX_SCRIPT_BYTES} UTF-8 bytes`)
        }
        command = ['nodejs']
        stdin = script
      }

      exec.signal.throwIfAborted()
      const result = await runEgo(options.binary, command, timeoutMs, exec.signal, stdin)
      return { action, ...result }
    },
  })

  ctx.effect(() => ctx.systemPrompt.section({
    name: 'ego-lite:dsh-ego-lite',
    order: 9100,
    text: () => [
      'For browser tasks, prefer the ego_browser tool over native-window Computer Use.',
      'Call ego_browser with action "skill" before the first browser task in a conversation, then follow that version-matched guide.',
      'Use action "run" for one complete top-level-await JavaScript round. Reuse one TaskSpace for the user goal; TaskSpaces and tabs persist, JavaScript variables do not.',
      'Call task.finish({ keep: [] }) when the browser task completes, unless the user explicitly needs a page kept open.',
      'Use the cua tool for native applications and windows, not ordinary website DOM automation.',
    ].join('\n'),
  }), 'dsh-ego-lite: system prompt')
}

function resolveOptions(config) {
  const binary = expandHome(config.binary ?? process.env.EGO_BROWSER_BIN
    ?? join(homedir(), '.local/bin/ego-browser'))
  if (!isAbsolute(binary)) throw new Error(`binary must be absolute: ${binary}`)
  if (!existsSync(binary)) throw new Error(`ego-browser binary not found: ${binary}`)
  return { binary }
}

function runEgo(binary, command, timeoutMs, signal, input) {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(binary, command, {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      timeout: timeoutMs,
      signal,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || '').trim()
        if (error.name === 'AbortError') {
          reject(new Error('ego-browser command aborted'))
        } else if (error.killed) {
          reject(new Error(`ego-browser command timed out or was cancelled${detail ? `: ${detail}` : ''}`))
        } else {
          reject(new Error(detail || error.message))
        }
        return
      }
      resolvePromise({ stdout: String(stdout), stderr: String(stderr) })
    })
    if (child.stdin !== null) child.stdin.end(input ?? '')
  })
}

function expandHome(value) {
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return resolve(value)
}

function objectArgs(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('arguments must be an object')
  }
  return value
}

function requiredString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} must be a non-empty string`)
  return value
}

function requiredEnum(value, field, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${field} must be one of: ${allowed.join(', ')}`)
  }
  return value
}

function optionalInteger(value, field, fallback, minimum, maximum) {
  if (value === undefined || value === null) return fallback
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer from ${minimum} to ${maximum}`)
  }
  return value
}

function rejectField(value, field, action) {
  if (value !== undefined) throw new Error(`${field} is not valid for action=${action}`)
}
