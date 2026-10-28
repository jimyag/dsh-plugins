window.__ModuleLoader__.load({
  id: 'dsh-codex-fast',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useRef, useState } = React
    const styles = `
      .dsh-codex-fast-control { display: inline-flex; align-items: center; gap: 6px; }
      .dsh-codex-fast-toggle {
        appearance: none; box-sizing: border-box; display: inline-flex;
        align-items: center; justify-content: center; gap: 4px;
        height: 28px; padding: 0 9px; margin-inline-end: 3px;
        border: 0; border-radius: 999px; background: transparent;
        color: var(--dsw-alias-label-secondary, #61666b);
        font: var(--dsw-font-xxs-12, 12px/20px sans-serif); font-weight: 500;
        white-space: nowrap; cursor: pointer;
        transition: color 120ms cubic-bezier(0.2, 0, 0, 1),
          background-color 120ms cubic-bezier(0.2, 0, 0, 1),
          transform 100ms cubic-bezier(0.2, 0, 0, 1);
      }
      .dsh-codex-fast-toggle:hover:not(:disabled) {
        background: var(--dsw-alias-button-ghost-active-fill, #ebeef2);
        color: var(--dsw-alias-label-primary, #0f1115);
      }
      .dsh-codex-fast-toggle[aria-pressed="true"] {
        color: var(--dsw-alias-label-primary, #0f1115);
        background: color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 12%, transparent);
      }
      .dsh-codex-fast-toggle[aria-pressed="true"]:hover:not(:disabled) {
        background: color-mix(in srgb, var(--dsw-alias-state-warn-label, #dd8629) 19%, transparent);
      }
      .dsh-codex-fast-icon { flex: none; transform: translateY(-0.25px); }
      .dsh-codex-fast-toggle[aria-pressed="true"] .dsh-codex-fast-icon {
        color: var(--dsw-alias-state-warn-label, #dd8629);
      }
      .dsh-codex-fast-toggle:active:not(:disabled) { transform: scale(0.96); }
      .dsh-codex-fast-toggle:focus-visible {
        outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-static-deepseek-500, #4176e6);
        outline-offset: 2px;
      }
      .dsh-codex-fast-toggle:disabled { opacity: 0.45; cursor: default; }
      .dsh-codex-fast-toggle[aria-busy="true"] { opacity: 0.6; cursor: progress; }
      .dsh-codex-fast-error { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
      @media (prefers-reduced-motion: reduce) {
        .dsh-codex-fast-toggle { transition: none; }
      }
    `

    async function requestState(sessionId, enabled, signal) {
      const path = enabled === undefined
        ? `/api/codex-fast?sessionId=${encodeURIComponent(sessionId)}`
        : '/api/codex-fast'
      const init = {
        method: enabled === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal,
        ...(enabled === undefined ? {} : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId, enabled }),
        }),
      }
      const transport = window.__DSH_TRANSPORT__
      const response = await (transport?.fetch
        ? transport.fetch(path, init)
        : window.fetch(path, init))
      if (!response.ok && !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error(`Fast 暂时不可用（HTTP ${response.status}），点击重试`)
      }
      const value = await response.json()
      if (!response.ok) {
        throw new Error(typeof value.error === 'string' ? value.error : value.error?.message ?? value.message ?? `Codex Fast: HTTP ${response.status}`)
      }
      if (typeof value.enabled !== 'boolean' || typeof value.supported !== 'boolean') {
        throw new Error('Codex Fast returned an invalid state')
      }
      return value
    }

    function FastToggle({ sessionId, useSession, runtime }) {
      const removed = useSession((session) => session.removed)
      const [view, setView] = useState(null)
      const actions = useRef(null)

      useEffect(() => {
        let active = true
        let last = null
        let reading
        let saving
        let writing = false
        let refreshAfterSave = false
        let revision = 0
        const publish = (busy, error = null) => {
          if (active) setView({ sessionId, state: last, busy, error })
        }
        const refresh = async () => {
          if (!active) return
          if (writing) {
            refreshAfterSave = true
            return
          }
          reading?.abort()
          const controller = new AbortController()
          reading = controller
          const requestedRevision = ++revision
          try {
            const value = await requestState(sessionId, undefined, controller.signal)
            if (!active || writing || revision !== requestedRevision) return
            last = value
            publish(false)
          } catch (error) {
            if (!active || controller.signal.aborted || revision !== requestedRevision) return
            publish(false, error instanceof Error ? error.message : String(error))
          }
        }
        const toggle = async () => {
          if (!active || writing || last === null || !last.supported) return
          writing = true
          reading?.abort()
          revision += 1
          const controller = new AbortController()
          saving = controller
          publish(true)
          try {
            const value = await requestState(sessionId, !last.enabled, controller.signal)
            if (!active) return
            last = value
            publish(false)
          } catch (error) {
            if (!active || controller.signal.aborted) return
            publish(false, error instanceof Error ? error.message : String(error))
          } finally {
            writing = false
            saving = undefined
            if (active && refreshAfterSave) {
              refreshAfterSave = false
              void refresh()
            }
          }
        }
        actions.current = { toggle, refresh }
        publish(false)
        void refresh()

        const binding = runtime.sessions.binding(sessionId)
        const eventSource = binding?.eventSource
        const unsubscribe = eventSource?.subscribe(() => {
          const change = eventSource.getSnapshot().change
          if (change.kind === 'replace' || change.entries?.some(({ event }) => (
            event.type === 'command/done'
            || event.type === 'model/selection'
            || event.type === 'request/header'
          ))) void refresh()
        })
        const offReset = runtime.on('connection/reset', () => { void refresh() })
        const onFocus = () => { void refresh() }
        window.addEventListener('focus', onFocus)
        return () => {
          active = false
          reading?.abort()
          saving?.abort()
          unsubscribe?.()
          offReset()
          window.removeEventListener('focus', onFocus)
          actions.current = null
        }
      }, [sessionId, runtime])

      const current = view?.sessionId === sessionId ? view : null
      const state = current?.state
      if (!state?.visible) return null
      const enabled = state?.supported && state.enabled || false
      const busy = current?.busy ?? false
      const disabled = removed || busy || (!state?.supported && !current?.error)
      const title = current?.error
        ?? (busy ? '正在保存 Fast 设置…'
          : !state ? '正在读取 Fast 状态…'
            : !state.supported ? '当前 GPT 连接暂不支持 Fast'
              : `Fast ${enabled ? '已开启，点击关闭' : '已关闭，点击开启'} · 仅当前会话 · /fast`)
      return h('span', {
        className: 'dsh-codex-fast-control',
      }, h('button', {
        type: 'button',
        className: 'dsh-codex-fast-toggle',
        'aria-label': 'GPT Fast',
        'aria-pressed': enabled,
        'aria-busy': busy,
        disabled,
        title,
        onClick: () => { void (current?.error ? actions.current?.refresh() : actions.current?.toggle()) },
      }, h('svg', {
        className: 'dsh-codex-fast-icon',
        width: 14, height: 14, viewBox: '0 0 16 16',
        fill: enabled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.5,
        strokeLinejoin: 'round', strokeLinecap: 'round',
        'aria-hidden': true,
      }, h('path', { d: 'M9.25 1.75 3.75 9h4l-1 5.25L12.25 7h-4z' })),
      'Fast'), current?.error && h('span', {
        role: 'status',
        title: current.error,
        className: 'dsh-codex-fast-error',
      }, current.error))
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style')
        style.textContent = styles
        document.head.append(style)
        return () => style.remove()
      })
      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'codex-fast',
        order: -10,
        inject: () => ({ runtime: ctx }),
      }, FastToggle))
    }

    return { name: 'codex-fast', inject: ['slots', 'sessions', 'connection'], apply }
  },
})
