export function isGptModel(model) {
  return typeof model === 'string' && /(?:^|[/_\s-])gpt(?=[-_.\d\s/]|$)/i.test(model)
}

export function withRequestScope(storage, scope, next) {
  const iterator = storage.run(scope, () => next()[Symbol.asyncIterator]())
  return {
    [Symbol.asyncIterator]() { return this },
    next: value => storage.run(scope, () => iterator.next(value)),
    return: value => storage.run(scope, () => iterator.return ? iterator.return(value) : Promise.resolve({ done: true, value })),
    throw: error => storage.run(scope, () => iterator.throw ? iterator.throw(error) : Promise.reject(error)),
  }
}

export function createFastFetch(originalFetch, currentRequest) {
  let active = true
  const send = (input, init) => originalFetch.call(globalThis, input, init)
  const wrapped = async (input, init) => {
    if (!active) return send(input, init)
    const scope = currentRequest()
    if (!scope?.enabled || !scope.target || !isGptModel(scope.model)) return send(input, init)
    const request = input instanceof Request ? input : undefined
    const method = init?.method ?? request?.method ?? 'GET'
    if (method.toUpperCase() !== 'POST') return send(input, init)
    const url = new URL(request?.url ?? String(input))
    if (url.origin !== scope.target.origin || url.pathname !== scope.target.pathname) return send(input, init)
    const body = init?.body ?? (request ? await request.clone().text() : undefined)
    if (typeof body !== 'string') return send(input, init)
    let payload
    try { payload = JSON.parse(body) } catch { return send(input, init) }
    if (payload?.model !== scope.model || !active) return send(input, init)
    const headers = new Headers(init?.headers ?? request?.headers)
    headers.delete('content-length')
    return send(input, { ...init, headers, body: JSON.stringify({ ...payload, service_tier: 'priority' }) })
  }
  wrapped.dispose = () => { active = false }
  return wrapped
}
