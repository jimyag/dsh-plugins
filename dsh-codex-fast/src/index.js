import { AsyncLocalStorage } from 'node:async_hooks'
import Schema from '@deepseek-ai/schemastery'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { createFastFetch, isGptModel, withRequestScope } from './transport.js'

export const name = 'dsh-codex-fast'
export const Config = Schema.object({})
export const inject = ['llm', 'commands', 'storageDomain', 'sessionController', 'sessionProjections', 'agentDefaultModel', 'connection', 'loader']
const domainSpec = defineDomain({
  name: 'codex_fast', version: 1,
  tables: { sessions: domainTable(z.object({ enabled: z.boolean() }).strict()) },
})
const sessionIdSchema = z.string().min(1).max(160)
const setSchema = z.object({ sessionId: sessionIdSchema, enabled: z.boolean() }).strict()

export async function apply(ctx) {
  const domain = await ctx.storageDomain.open(domainSpec)
  ctx.effect(() => () => domain.close(), 'codex-fast: session state')
  const states = domain.table('sessions')
  const nativeProviders = () => ctx.loader.resolve('include:llm-pi-ai')?.options.config?.providers ?? {}
  const targetFor = profile => {
    if (typeof profile?.baseURL !== 'string') return undefined
    const path = profile.api === 'openai-responses' ? 'responses' : profile.api === 'openai-completions' ? 'chat/completions' : undefined
    return path ? new URL(path, profile.baseURL.replace(/\/?$/, '/')) : undefined
  }
  const stateForAgent = agent => {
    const pending = ctx.sessionProjections.stateOf(agent.session, 'modelSelection')?.pending
    const route = pending ?? agent.session.requestHeader()?.config ?? ctx.agentDefaultModel.currentSelection()
    return {
      enabled: states.get(agent.session.id)?.enabled === true,
      visible: isGptModel(route.model),
      supported: isGptModel(route.model) && targetFor(nativeProviders()[route.provider]) !== undefined,
      provider: route.provider, model: route.model,
    }
  }
  const requestScope = new AsyncLocalStorage()
  ctx.on('llm/stream', (options, next) => {
    const sessionId = options.sessionId === undefined ? undefined : String(options.sessionId)
    const target = targetFor(nativeProviders()[options.provider])
    const scope = {
      sessionId, provider: options.provider, model: options.model, target,
      enabled: sessionId !== undefined && isGptModel(options.model) && target !== undefined && states.get(sessionId)?.enabled === true,
    }
    return withRequestScope(requestScope, scope, next)
  })
  const originalFetch = globalThis.fetch
  const fastFetch = createFastFetch(originalFetch, () => requestScope.getStore())
  // Preserve the native adapter and its replay path; only this endpoint and
  // enabled session can change. Disposed wrappers become transparent even if
  // an existing SDK client still holds their reference during a retry.
  ctx.effect(() => {
    globalThis.fetch = fastFetch
    return () => {
      fastFetch.dispose()
      if (globalThis.fetch === fastFetch) globalThis.fetch = originalFetch
    }
  }, 'codex-fast: scoped Responses request hook')

  const setForAgent = async (agent, enabled) => {
    if (enabled && !stateForAgent(agent).supported) throw new RequestError(400, '当前模型或连接不支持 GPT Fast。')
    await states.put(agent.session.id, { enabled })
    return stateForAgent(agent)
  }
  const resolveAgent = async sessionId => {
    const found = await ctx.sessionController.resolveAgent(sessionId)
    if ('error' in found) throw new RequestError(404, found.error.message)
    return found.agent
  }
  ctx.connection.fetch.register({
    path: '/api/codex-fast', methods: ['GET', 'POST'], requestBody: 'buffered',
    fetch: async request => {
      try {
        if (request.method === 'GET') {
          const result = sessionIdSchema.safeParse(new URL(request.url).searchParams.get('sessionId'))
          if (!result.success) throw new RequestError(400, 'A sessionId is required.')
          return json(stateForAgent(await resolveAgent(result.data)))
        }
        let body
        try { body = await request.json() } catch { throw new RequestError(400, 'Expected a JSON request body.') }
        const result = setSchema.safeParse(body)
        if (!result.success) throw new RequestError(400, 'Expected {sessionId: string, enabled: boolean}.')
        return json(await setForAgent(await resolveAgent(result.data.sessionId), result.data.enabled))
      } catch (error) {
        if (error instanceof RequestError) return json({ error: error.message }, error.status)
        ctx.logger.error(error)
        return json({ error: '无法读取或保存 Fast 设置，请查看 Harness 日志。' }, 500)
      }
    },
  })
  ctx.commands.register({
    name: 'fast', description: 'Toggle GPT Fast for this session', input: { hint: '[on|off|status]' },
    handler: async ({ agent, rawInput }) => {
      const mode = rawInput.trim().toLowerCase()
      if (!['', 'on', 'off', 'status'].includes(mode)) return { kind: 'error', text: 'Usage: /fast [on|off|status]' }
      const current = stateForAgent(agent)
      if (mode === 'status') return { kind: 'success', text: current.supported ? `当前会话 Fast 已${current.enabled ? '开启' : '关闭'}。` : '当前模型或连接不支持 GPT Fast。' }
      try {
        const next = await setForAgent(agent, mode === '' ? !current.enabled : mode === 'on')
        return { kind: 'success', text: `当前会话 Fast 已${next.enabled ? '开启' : '关闭'}，后续请求生效。` }
      } catch (error) {
        if (error instanceof RequestError) return { kind: 'error', text: error.message }
        throw error
      }
    },
  })
}
class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}
