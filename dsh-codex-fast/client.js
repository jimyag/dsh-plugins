window.__ModuleLoader__.load({
  id: 'dsh-codex-fast',
  factory(require) {
    const React = require('react')
    const { createElement: h, useEffect, useId, useRef, useState } = React
    const { createPortal } = require('react-dom')
    const { MenuSurface, useAnchoredPosition, useDismissOnOutsidePointer, IconRefreshOutlineRegular, IconSlidersTwoOutlineRegular } = require('@deepseek-ai/dsh-client-ui-primitives')
    const styles = `
      .mc-root, .mc-panel { --mc-effort: #6b7280; --mc-fill: var(--mc-effort); --mc-ink: color-mix(in srgb, var(--mc-fill) 65%, var(--dsw-alias-label-primary, #0f1115)); }
      .mc-root[data-level="0"], .mc-panel[data-level="0"] { --mc-effort: #6b7280; }
      .mc-root[data-level="1"], .mc-panel[data-level="1"] { --mc-effort: #2563eb; }
      .mc-root[data-level="2"], .mc-panel[data-level="2"] { --mc-effort: #7c3aed; }
      .mc-root[data-level="3"], .mc-panel[data-level="3"] { --mc-effort: #16a34a; }
      .mc-root[data-level="4"], .mc-panel[data-level="4"] { --mc-effort: #ea580c; }
      .mc-root[data-level="5"], .mc-panel[data-level="5"] { --mc-effort: #dc2626; }
      .mc-root[data-fast="true"][data-level="0"], .mc-panel[data-fast="true"][data-level="0"] { --mc-fill: #c9b48c; }
      .mc-root[data-fast="true"][data-level="1"], .mc-panel[data-fast="true"][data-level="1"] { --mc-fill: #dfc07a; }
      .mc-root[data-fast="true"][data-level="2"], .mc-panel[data-fast="true"][data-level="2"] { --mc-fill: #d8a94f; }
      .mc-root[data-fast="true"][data-level="3"], .mc-panel[data-fast="true"][data-level="3"] { --mc-fill: #c9922f; }
      .mc-root[data-fast="true"][data-level="4"], .mc-panel[data-fast="true"][data-level="4"] { --mc-fill: #b87a1a; }
      .mc-root[data-fast="true"][data-level="5"], .mc-panel[data-fast="true"][data-level="5"] { --mc-fill: #a0620c; }
      .mc-trigger, .mc-panel button { appearance: none; font: inherit; cursor: pointer; color: inherit; border: 0; background: transparent; }
      .mc-trigger { display: flex; align-items: center; gap: 7px; min-height: 28px; max-width: 310px; padding: 3px 9px; border-radius: 999px; font-size: 12px; color: var(--dsw-alias-label-secondary, #61666b); }
      .mc-trigger[data-fast="true"] { background: color-mix(in srgb, var(--mc-fill) 14%, transparent); color: var(--mc-ink); }
      .mc-trigger-model { display: var(--dsh-composer-model-text-display, block); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
      .mc-trigger-effort { display: var(--dsh-composer-model-text-display, block); white-space: nowrap; }
      .mc-trigger-dot { width: 6px; height: 6px; flex: none; border-radius: 50%; background: var(--mc-fill); }
      .mc-compact-icon { display: var(--dsh-composer-model-icon-display, none); }
      .mc-trigger svg, .mc-panel svg { flex: none; }
      .mc-trigger:disabled, .mc-panel button:disabled, .mc-slider:disabled { opacity: .45; cursor: default; }
      .mc-trigger:focus-visible, .mc-panel button:focus-visible, .mc-slider:focus-visible, .mc-search:focus-visible { outline: 2px solid var(--dsw-static-deepseek-500, #4176e6); outline-offset: 2px; }
      .mc-panel.mc-panel { box-sizing: border-box; width: 280px; max-width: calc(100vw - 24px); padding: 10px 12px 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 10%, transparent); border-radius: 20px; color: var(--dsw-alias-label-primary, #0f1115); font-size: 13px; line-height: 1.4; overflow: hidden; }
      .mc-header { display: grid; grid-template-columns: 58px minmax(0, 1fr) 58px; align-items: center; min-height: 34px; }
      .mc-level { text-align: center; font-size: 15px; font-weight: 500; color: var(--mc-ink); }
      .mc-panel .mc-icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 3px; height: 34px; min-width: 34px; padding: 0 7px; border-radius: 11px; color: var(--dsw-alias-label-secondary, #61666b); }
      .mc-fast { justify-self: start; font-size: 11px !important; }
      .mc-panel .mc-fast[aria-pressed="true"] { color: var(--mc-ink); background: color-mix(in srgb, var(--mc-fill) 15%, transparent); }
      .mc-reset { justify-self: end; }
      .mc-panel .mc-model-button { display: flex; align-items: center; justify-content: center; gap: 4px; width: 100%; min-height: 31px; padding: 3px 5px; border-radius: 8px; color: var(--dsw-alias-label-secondary, #61666b); font-size: 12px; }
      .mc-model-name { overflow-wrap: anywhere; }
      .mc-slider-wrap { position: relative; height: 40px; margin-top: 4px; }
      .mc-track { position: absolute; inset: 7px 0; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 9%, transparent); overflow: hidden; }
      .mc-fill { position: absolute; inset: 0 auto 0 0; background: var(--mc-fill); }
      .mc-dots { position: absolute; inset: 0 13px; display: flex; justify-content: space-between; align-items: center; pointer-events: none; }
      .mc-dot { width: 4px; height: 4px; flex: none; border-radius: 50%; background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 22%, transparent); }
      .mc-dot[data-filled="true"] { background: #ffffff70; }
      .mc-slider { appearance: none; -webkit-appearance: none; position: relative; display: block; width: 100%; height: 40px; margin: 0; background: transparent; cursor: pointer; border-radius: 999px; }
      .mc-slider::-webkit-slider-runnable-track { height: 26px; background: transparent; border-radius: 999px; }
      .mc-slider::-webkit-slider-thumb { appearance: none; -webkit-appearance: none; width: 28px; height: 28px; margin-top: -1px; border: 1px solid #0000000d; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px #00000022; }
      .mc-slider::-moz-range-track { height: 26px; background: transparent; }
      .mc-slider::-moz-range-thumb { width: 27px; height: 27px; border: 1px solid #0000000d; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px #00000022; }
      .mc-note { color: var(--dsw-alias-label-secondary, #61666b); text-align: center; font-size: 11px; padding: 9px 4px 2px; }
      .mc-error { margin: 6px 0 0; color: var(--dsw-alias-state-error-label, #b34635); font-size: 11px; overflow-wrap: anywhere; }
      .mc-list-header { display: flex; align-items: center; gap: 5px; margin-bottom: 5px; }
      .mc-list-title { font-weight: 500; }
      .mc-search { box-sizing: border-box; width: 100%; min-height: 36px; padding: 7px 9px; margin-bottom: 6px; background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 4%, transparent); border: 0; border-radius: 9px; color: inherit; font: inherit; font-size: 12px; }
      .mc-models { max-height: min(310px, 54vh); overflow-y: auto; overscroll-behavior: contain; }
      .mc-group-label { padding: 9px 8px 4px; font-size: 10px; color: var(--dsw-alias-label-secondary, #61666b); }
      .mc-panel .mc-option { display: flex; justify-content: space-between; align-items: center; gap: 8px; width: 100%; min-height: 36px; padding: 7px 8px; border-radius: 9px; text-align: left; font-size: 12px; overflow-wrap: anywhere; }
      .mc-option[data-highlighted="true"], .mc-panel .mc-option[aria-selected="true"] { background: color-mix(in srgb, var(--mc-fill) 12%, transparent); }
      .mc-check { color: var(--mc-ink); flex: none; }
      @media (hover: hover) { .mc-trigger:hover:not(:disabled), .mc-panel button:hover:not(:disabled) { background: color-mix(in srgb, var(--dsw-alias-label-primary, #0f1115) 5%, transparent); } }
      .mc-trigger:active:not(:disabled), .mc-panel button:active:not(:disabled) { transform: scale(.97); }
      @media (prefers-reduced-motion: no-preference) { .mc-trigger, .mc-panel button { transition: transform 100ms ease-out; } }
    `

    async function requestState(sessionId, enabled, signal) {
      const path = enabled === undefined ? `/api/codex-fast?sessionId=${encodeURIComponent(sessionId)}` : '/api/codex-fast'
      const init = { method: enabled === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', signal,
        ...(enabled === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId, enabled }) }) }
      const transport = window.__DSH_TRANSPORT__
      const response = await (transport?.fetch ? transport.fetch(path, init) : window.fetch(path, init))
      if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(`Fast 暂时不可用（HTTP ${response.status}）`)
      const value = await response.json()
      if (!response.ok) throw new Error(typeof value.error === 'string' ? value.error : value.error?.message ?? `Fast: HTTP ${response.status}`)
      if (typeof value.enabled !== 'boolean' || typeof value.supported !== 'boolean') throw new Error('Fast 返回了无效状态')
      return value
    }

    function useFastState(sessionId, runtime) {
      const [view, setView] = useState(null)
      const actions = useRef(null)
      useEffect(() => {
        let active = true, last = null, reading, saving, writing = false, refreshAfterSave = false, revision = 0
        const publish = (busy, error = null) => { if (active) setView({ sessionId, state: last, busy, error }) }
        const refresh = async () => {
          if (!active) return
          if (writing) { refreshAfterSave = true; return }
          reading?.abort()
          const controller = new AbortController(); reading = controller
          const requestedRevision = ++revision
          try {
            const value = await requestState(sessionId, undefined, controller.signal)
            if (!active || writing || revision !== requestedRevision) return
            last = value; publish(false)
          } catch (error) {
            if (active && !controller.signal.aborted && revision === requestedRevision) publish(false, error.message)
          }
        }
        const save = async enabled => {
          if (!active || writing || last === null || (enabled && !last.supported)) return false
          writing = true; reading?.abort(); revision += 1
          const controller = new AbortController(); saving = controller; publish(true)
          try {
            last = await requestState(sessionId, enabled, controller.signal)
            if (!active) return false
            publish(false); return true
          } catch (error) {
            if (active && !controller.signal.aborted) publish(false, error.message)
            return false
          } finally {
            writing = false; saving = undefined
            if (active && refreshAfterSave) { refreshAfterSave = false; void refresh() }
          }
        }
        actions.current = { save, refresh }; publish(false); void refresh()
        const eventSource = runtime.sessions.binding(sessionId)?.eventSource
        const unsubscribe = eventSource?.subscribe(() => {
          const change = eventSource.getSnapshot().change
          if (change.kind === 'replace' || change.entries?.some(({ event }) => ['command/done', 'model/selection', 'request/header'].includes(event.type))) void refresh()
        })
        const offReset = runtime.on('connection/reset', () => { void refresh() })
        const onFocus = () => { void refresh() }
        window.addEventListener('focus', onFocus)
        return () => { active = false; reading?.abort(); saving?.abort(); unsubscribe?.(); offReset(); window.removeEventListener('focus', onFocus); actions.current = null }
      }, [sessionId, runtime])
      return [view?.sessionId === sessionId ? view : null, actions]
    }

    const chevron = direction => h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true }, h('path', { d: direction === 'left' ? 'm10 4-4 4 4 4' : direction === 'down' ? 'm4 6 4 4 4-4' : 'm6 4 4 4-4 4' }))
    const lightning = enabled => h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', fill: enabled ? 'currentColor' : 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M9.25 1.75 3.75 9h4l-1 5.25L12.25 7h-4z' }))
    const shortName = model => model?.name.split(' · ')[0] ?? '选择模型'

    function ModelControls({ sessionId, useSession, useModelDirectory, load, select, runtime, locked }) {
      const removed = useSession(session => session.removed)
      const directory = useModelDirectory(value => value)
      const [fast, fastActions] = useFastState(sessionId, runtime)
      const [open, setOpen] = useState(false)
      const [pane, setPane] = useState('controls')
      const [query, setQuery] = useState('')
      const [highlight, setHighlight] = useState(0)
      const [preview, setPreview] = useState(null)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)
      const rootRef = useRef(null), triggerRef = useRef(null), panelRef = useRef(null), searchRef = useRef(null), sliderRef = useRef(null), modelRef = useRef(null), dragging = useRef(false)
      const panelId = useId(), listId = useId()
      const current = directory.current
      const group = directory.groups.find(group => group.id === current?.provider)
      const model = group?.models.find(model => model.id === current?.model)
      const advertisedLevels = model?.reasoning?.efforts ?? []
      const levels = model?.reasoning && model.reasoning.defaultEffort === undefined
        ? [{ id: undefined, name: 'Default' }, ...advertisedLevels]
        : advertisedLevels
      const effortId = current?.reasoningEffort ?? model?.reasoning?.defaultEffort
      const selectedIndex = levels.findIndex(level => level.id === effortId)
      const index = preview ?? Math.max(0, selectedIndex)
      const toneOf = level => {
        const text = `${level?.id ?? ''} ${level?.name ?? ''}`.toLocaleLowerCase()
        if (/max|highest|最高|最大/.test(text)) return 5
        if (/xhigh|extra|极高/.test(text)) return 4
        if (/high|高/.test(text)) return 3
        if (/medium|mid|中/.test(text)) return 2
        if (/low|min|低/.test(text)) return 1
        return 0
      }
      const tone = levels.length > 1 ? toneOf(levels[index]) : 0
      const effortName = preview !== null ? levels[index]?.name : levels.find(level => level.id === effortId)?.name
      const fastEnabled = fast?.state?.visible && fast.state.supported && fast.state.enabled || false
      const busy = saving || directory.status === 'selecting' || fast?.busy
      const disabled = locked || removed || busy
      const position = useAnchoredPosition({ open, anchorRef: triggerRef, panelRef, side: 'top', align: 'end', gap: 8, margin: 12 })
      useDismissOnOutsidePointer(rootRef, open, setOpen, panelRef)
      useEffect(() => { load().catch(error => setError(error.message)) }, [load])
      useEffect(() => { setOpen(false); setPane('controls'); setError(null); setPreview(null) }, [sessionId])
      useEffect(() => {
        if (!open) return
        const onKeyDown = event => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          if (pane === 'models') { setPane('controls'); requestAnimationFrame(() => modelRef.current?.focus()) } else close()
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => document.removeEventListener('keydown', onKeyDown, true)
      }, [open, pane])
      useEffect(() => {
        if (!open) return
        const frame = requestAnimationFrame(() => {
          if (pane === 'models') searchRef.current?.focus()
          else (sliderRef.current ?? modelRef.current)?.focus()
        })
        return () => cancelAnimationFrame(frame)
      }, [open, pane])
      useEffect(() => { if (!dragging.current) setPreview(null) }, [effortId, current?.provider, current?.model])
      useEffect(() => {
        if (open && pane === 'models') panelRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' })
      }, [open, pane, highlight, query])

      const close = () => { setOpen(false); setPane('controls'); setPreview(null); requestAnimationFrame(() => triggerRef.current?.focus()) }
      const choose = async selection => {
        if (disabled) return false
        setSaving(true); setError(null)
        try {
          const result = await select(selection)
          if (!result?.ok) throw result?.error ?? new Error('模型选择暂不可用')
          return true
        } catch (error) { setError(error.message); return false }
        finally { setSaving(false); setPreview(null) }
      }
      const commitEffort = value => {
        const level = levels[Number(value)]
        if (level && current && level.id !== effortId) void choose({ provider: current.provider, model: current.model, reasoningEffort: level.id })
        else setPreview(null)
      }
      const reset = async () => {
        if (!current || disabled) return
        if (await choose({ provider: current.provider, model: current.model })) await fastActions.current?.save(false)
      }
      const groups = directory.groups.map(group => ({ ...group, models: group.models.filter(model => {
        const text = `${model.name} ${group.name} ${model.id}`.toLocaleLowerCase()
        const needle = query.trim().toLocaleLowerCase()
        if (text.includes(needle)) return true
        let offset = 0
        for (const char of needle) { offset = text.indexOf(char, offset); if (offset < 0) return false; offset += 1 }
        return true
      }) })).filter(group => group.models.length)
      const options = groups.flatMap(group => group.models.map(model => ({ group, model })))
      const pickModel = async entry => {
        const selection = { provider: entry.group.id, model: entry.model.id }
        if (entry.model.reasoning?.defaultEffort !== undefined) selection.reasoningEffort = entry.model.reasoning.defaultEffort
        if (await choose(selection)) { setPane('controls'); setQuery('') }
      }
      const onPanelKey = event => {
        if (event.key === 'Tab') {
          const items = [...panelRef.current.querySelectorAll('button:not(:disabled),input:not(:disabled)')]
          if ((event.shiftKey && event.target === items[0]) || (!event.shiftKey && event.target === items.at(-1))) { event.preventDefault(); close() }
        }
      }
      const panel = open && h(MenuSurface, {
        ref: panelRef, id: panelId, compact: true, role: 'dialog', 'aria-label': '模型与推理设置', 'aria-busy': busy,
        className: 'mc-panel', 'data-fast': fastEnabled, 'data-level': tone,
        style: { position: 'fixed', zIndex: 1100, ...(position ?? { visibility: 'hidden', left: 0, top: 0 }) }, onKeyDown: onPanelKey,
      }, pane === 'controls' ? h(React.Fragment, null,
        h('div', { className: 'mc-header' },
          fast?.state?.visible ? h('button', { type: 'button', className: 'mc-icon-button mc-fast', 'aria-label': 'GPT Fast', 'aria-pressed': fastEnabled, disabled: disabled || !fast.state.supported,
            title: !fast.state.supported ? '当前 GPT 连接暂不支持 Fast' : `Fast ${fastEnabled ? '已开启' : '已关闭'} · 仅当前会话`, onClick: () => { void fastActions.current?.save(!fastEnabled) } }, lightning(fastEnabled), fastEnabled && 'Fast') : h('span'),
          h('div', { className: 'mc-level', 'aria-live': 'polite' }, effortName ?? (levels.length ? '默认' : '模型')),
          h('button', { type: 'button', className: 'mc-icon-button mc-reset', 'aria-label': '重置推理等级并关闭 Fast', title: '重置为模型默认等级，并关闭 Fast', disabled: disabled || !current,
            onClick: () => { void reset() } }, h(IconRefreshOutlineRegular, { size: 15 }))),
        h('button', { ref: modelRef, type: 'button', className: 'mc-model-button', disabled, 'aria-label': `选择模型，当前 ${model?.name ?? '未选择'}`,
          title: model ? `${group.name} · ${model.name}` : '选择模型', onClick: () => { setQuery(''); setHighlight(0); setPane('models') } }, h('span', { className: 'mc-model-name' }, shortName(model)), chevron('right')),
        levels.length > 1 ? h('div', { className: 'mc-slider-wrap' },
          h('div', { className: 'mc-track', 'aria-hidden': true }, h('div', { className: 'mc-fill', style: { width: `calc(13px + (100% - 26px) * ${index / (levels.length - 1)})` } }),
            h('div', { className: 'mc-dots' }, levels.map((level, i) => h('span', { key: i, className: 'mc-dot', 'data-filled': i <= index })))),
          h('input', { ref: sliderRef, className: 'mc-slider', type: 'range', min: 0, max: levels.length - 1, step: 1, value: index, disabled: disabled || selectedIndex < 0,
            'aria-label': '推理等级', 'aria-valuetext': effortName ?? '默认', title: effortName ?? '默认',
            onPointerDown: () => { dragging.current = true },
            onChange: event => { const value = Number(event.target.value); setPreview(value); if (!dragging.current) commitEffort(value) },
            onPointerUp: event => { dragging.current = false; commitEffort(event.currentTarget.value) },
            onPointerCancel: () => { dragging.current = false; setPreview(null) },
          })) : h('div', { className: 'mc-note' }, levels.length === 1 ? '此模型使用固定推理等级' : '此模型不提供推理等级'),
      ) : h(React.Fragment, null,
        h('div', { className: 'mc-list-header' }, h('button', { type: 'button', className: 'mc-icon-button', 'aria-label': '返回推理设置', onClick: () => setPane('controls') }, chevron('left')), h('span', { className: 'mc-list-title' }, '选择模型')),
        h('input', { ref: searchRef, type: 'search', className: 'mc-search', placeholder: '搜索模型…', 'aria-label': '搜索模型', role: 'combobox', 'aria-expanded': true, 'aria-controls': listId,
          'aria-activedescendant': options.length ? `${listId}-${Math.min(highlight, options.length - 1)}` : undefined, value: query,
          onChange: event => { setQuery(event.target.value); setHighlight(0) },
          onKeyDown: event => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setHighlight(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % (options.length || 1)) }
            if (event.key === 'Enter' && options[highlight]) { event.preventDefault(); void pickModel(options[highlight]) }
          } }),
        h('div', { className: 'mc-models', id: listId, role: 'listbox', 'aria-label': '模型' },
          ...groups.map(group => h('div', { key: group.id, role: 'group', 'aria-label': group.name },
            h('div', { className: 'mc-group-label', 'aria-hidden': true }, group.name),
            ...group.models.map(model => {
              const i = options.findIndex(entry => entry.group.id === group.id && entry.model.id === model.id)
              const selected = current?.provider === group.id && current?.model === model.id
              return h('button', { key: model.id, id: `${listId}-${i}`, type: 'button', role: 'option', className: 'mc-option', disabled,
                'aria-selected': selected, 'data-highlighted': i === highlight, onMouseMove: () => setHighlight(i), onClick: () => { void pickModel({ group, model }) } },
                h('span', null, model.name), selected && h('span', { className: 'mc-check', 'aria-hidden': true }, '✓'))
            }))),
          !options.length && h('div', { className: 'mc-note', role: 'status' }, directory.status === 'loading' ? '正在读取模型…' : '没有匹配的模型'),
          ...directory.failures.map(failure => h('div', { key: failure.id, className: 'mc-error' }, `${failure.name}：${failure.message}`))),
      ), (error || fast?.error || directory.error) && h('div', { className: 'mc-error', role: 'alert' }, error || fast?.error || directory.error))

      return h('span', { ref: rootRef, className: 'mc-root', 'data-fast': fastEnabled, 'data-level': tone },
        h('button', { ref: triggerRef, type: 'button', className: 'mc-trigger', 'data-fast': fastEnabled, disabled: locked || removed,
          'aria-label': `模型与推理设置，当前 ${model?.name ?? '未选择'}${effortName ? `，${effortName}` : ''}${fastEnabled ? '，Fast 已开启' : ''}`,
          'aria-expanded': open, 'aria-haspopup': 'dialog', 'aria-controls': open ? panelId : undefined,
          title: `${group?.name ?? ''} · ${model?.name ?? '选择模型'}${effortName ? ` · ${effortName}` : ''}${fastEnabled ? ' · Fast' : ''}`,
          onClick: () => { setPane('controls'); setOpen(value => !value) },
          onKeyDown: event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } },
        }, fastEnabled && lightning(true), h('span', { className: 'mc-compact-icon' }, h(IconSlidersTwoOutlineRegular, { size: 15 })),
        h('span', { className: 'mc-trigger-model' }, shortName(model)), effortName && h('span', { className: 'mc-trigger-dot', 'aria-hidden': true }), effortName && h('span', { className: 'mc-trigger-effort' }, effortName), chevron('down')),
        panel && createPortal(panel, document.body))
    }

    function apply(ctx) {
      ctx.effect(() => { const style = document.createElement('style'); style.textContent = styles; document.head.append(style); return () => style.remove() })
      ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
        name: 'conversation.input.model', id: 'model-controls', priority: -1,
        inject: sessionId => {
          const directory = ctx.modelDirectories.directoryFor(sessionId)
          return { hooks: { modelDirectory: directory.store }, load: () => directory.load(), select: selection => directory.select(selection), runtime: ctx }
        },
      }, ModelControls))
    }
    return { name: 'model-controls', inject: ['slots', 'sessions', 'remote', 'remote.session', 'modelDirectories'], apply }
  },
})
