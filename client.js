// 独立设置页：只读写表情插件接口，不发送 QQ 消息。
window.__ModuleLoader__.load({
  id: 'dsh-stickers',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const inject = ['slots']
    const S = {
      wrap: { padding: 16, fontSize: 13, lineHeight: 1.7, color: 'inherit', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 8 },
      row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, margin: '10px 0' },
      field: { display: 'grid', gap: 4, margin: '10px 0' },
      control: { padding: '6px 10px', border: '1px solid var(--dsw-alias-border-l2, #888)', borderRadius: 6, background: 'var(--dsw-alias-bg-layer-1)', color: 'inherit', font: 'inherit', boxSizing: 'border-box', maxWidth: '100%' },
      hint: { opacity: 0.72, fontSize: 12 },
      details: { borderTop: '1px solid var(--dsw-alias-border-l2, #888)', padding: '10px 0' },
      summary: { cursor: 'pointer', fontWeight: 600 },
      counts: { display: 'flex', flexWrap: 'wrap', gap: '4px 16px', margin: '4px 0' },
      table: { width: '100%', borderCollapse: 'collapse' },
      cell: { padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid var(--dsw-alias-border-l2, #888)' },
    }

    async function request(path, body, signal) {
      const response = await fetch('/dsh-stickers/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        cache: 'no-store',
        ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        signal,
      })
      let data
      try { data = await response.json() }
      catch { throw new Error('接口未返回 JSON（HTTP ' + response.status + '）') }
      if (!response.ok || !data || data.ok !== true) {
        throw new Error((data && data.error) || '请求失败（HTTP ' + response.status + '）')
      }
      return data
    }

    function counts(title, values) {
      const entries = Object.entries(values || {})
      return h('div', null,
        h('h3', { style: { fontSize: 13, marginBottom: 4 } }, title),
        h('div', { style: S.counts }, entries.length
          ? entries.map(([name, count]) => h('span', { key: name }, name + '：' + count))
          : '暂无数据'),
      )
    }

    function Section() {
      const [state, setState] = React.useState(null)
      const [draft, setDraft] = React.useState(null)
      const [emotion, setEmotion] = React.useState('')
      const [collection, setCollection] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [busy, setBusy] = React.useState('')
      const [error, setError] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const pending = React.useRef(null)
      const sequence = React.useRef(0)
      const run = React.useCallback(async (action, body) => {
        const current = ++sequence.current
        if (pending.current) pending.current.abort()
        const controller = new AbortController()
        pending.current = controller
        setBusy(action)
        setError('')
        setNotice('')
        if (action !== 'preview' || !body || (body.step !== -1 && body.step !== 1)) setPreview(null)
        try {
          const data = await request(action === 'refresh' ? 'state' : action, body, controller.signal)
          if (current !== sequence.current) return
          if (action === 'preview') {
            if (data.matches === 0) {
              setPreview(null)
              setNotice('这个情绪和人物组合没有候选图片。')
            } else if (typeof data.previewUrl !== 'string' || !data.previewUrl) {
              throw new Error('接口没有返回可访问的 previewUrl，无法显示图片；本地图片路径不能直接在网页中打开。')
            } else {
              // Desktop uses its own protocol; keep host-relative image routes like other plugins.
              if (!/^\/dsh-stickers\/image\?id=[^&#\s]+$/.test(data.previewUrl)) {
                throw new Error('预览图片地址必须是插件图片接口。')
              }
              setPreview({ ...data, requestId: current })
            }
          } else {
            if (!data.config || typeof data.config.enabled !== 'boolean' ||
                typeof data.config.libraryPath !== 'string' || typeof data.config.pythonPath !== 'string') {
              throw new Error('接口返回的状态不完整。')
            }
            setState(data)
            setDraft({ enabled: data.config.enabled, libraryPath: data.config.libraryPath })
            const emotions = Object.keys((data.stats && data.stats.emotions) || {})
            const collections = Object.keys((data.stats && data.stats.collections) || {})
            setEmotion((old) => emotions.includes(old) ? old : (emotions[0] || ''))
            setCollection((old) => collections.includes(old) ? old : '')
            setNotice(action === 'config' ? '设置已保存。' : '状态已刷新。')
          }
        } catch (err) {
          if (current === sequence.current && err.name !== 'AbortError') setError(err.message || '请求失败。')
        } finally {
          if (current === sequence.current) {
            pending.current = null
            setBusy('')
          }
        }
      }, [])

      React.useEffect(() => {
        run('refresh')
        return () => {
          ++sequence.current
          if (pending.current) pending.current.abort()
        }
      }, [run])

      const dirty = !!(state && draft && (
        draft.enabled !== state.config.enabled || draft.libraryPath !== state.config.libraryPath
      ))
      const button = (text, onClick, disabled) => h('button', {
        type: 'button', style: S.control, onClick, disabled: !!busy || disabled,
      }, text)
      const edit = (key, value) => {
        setDraft((old) => ({ ...old, [key]: value }))
        setPreview(null)
        setNotice('')
      }
      const select = (label, value, change, items, placeholder) => h('label', null, label + ' ', h('select', {
        style: S.control, value, disabled: !!busy,
        onChange: (e) => { change(e.target.value); setPreview(null); setNotice('') },
      }, h('option', { value: '' }, placeholder),
      Object.entries(items || {}).map(([name, count]) => h('option', { key: name, value: name }, name + '（' + count + '）'))))
      const stats = state && state.stats
      const emotions = Object.entries((stats && stats.emotions) || {})
      const emotionRows = Array.from({ length: Math.ceil(emotions.length / 2) }, (_, i) => [emotions[i * 2], emotions[i * 2 + 1] || ['', '']])
      return h('section', { style: S.wrap, 'aria-label': '表情包设置', 'aria-busy': !!busy },
        h('h2', { style: { fontSize: 16, marginTop: 0 } }, '表情包'),
        h('div', { style: S.row },
          draft ? h('label', null,
            h('input', { type: 'checkbox', checked: draft.enabled, disabled: !!busy, onChange: (e) => edit('enabled', e.target.checked) }),
            ' 启用表情包插件') : null,
          button(busy === 'config' ? '保存中…' : '保存设置', () => run('config', draft), !dirty),
          button(busy === 'refresh' ? '读取中…' : '刷新状态', () => run('refresh'), false)),
        h('p', { style: S.hint }, dirty ? '未保存 · 保存后才能预览；刷新会丢弃改动。' : '修改后需保存。'),
        stats ? h('p', null, '总数：' + stats.total + '　可用：' + stats.available + '　缺失：' + stats.missing) : null,
        error ? h('p', { role: 'alert' }, '错误：' + error) : null,
        state && state.error ? h('p', { role: 'alert' }, '素材状态：' + state.error) : null,
        h('div', { role: 'status', 'aria-live': 'polite' }, busy
          ? ({ refresh: '读取状态中…', config: '保存中…', preview: '预览中…' }[busy]) : notice),
        stats ? h('div', null,
          h('h3', { style: { fontSize: 14 } }, '仅预览'),
          h('p', { style: S.hint }, '情绪内每张图片等概率抽取；不发送 QQ，不记入选图记录。'),
          h('div', { style: S.row },
            select('情绪', emotion, setEmotion, stats.emotions, '选择情绪'),
            select('人物', collection, setCollection, stats.collections, '全部人物'),
            button('仅预览', () => run('preview', { emotion, ...(collection ? { collection } : {}) }),
              dirty || !state.config.enabled || !emotion)),
          !state.config.enabled ? h('p', { style: S.hint }, '插件已关闭，启用并保存后才能挑图预览。') : null,
          preview ? h('figure', { style: { margin: '12px 0' } },
            h('img', {
              key: preview.requestId, src: preview.previewUrl, alt: preview.label || '表情包预览',
              style: { display: 'block', maxWidth: '100%', maxHeight: 400, objectFit: 'contain' },
              onError: () => { setPreview(null); setError('预览图片加载失败，请检查素材路径或刷新后重试。') },
            }),
            h('figcaption', { style: S.hint },
              [preview.label, preview.category, preview.collection, preview.candidateCount == null ? '' : '候选 ' + preview.candidateCount + ' 张'].filter(Boolean).join(' · ')),
            preview.navigation !== true ? h('p', { role: 'alert' }, '后端尚未加载图片切换功能，请重启 DSH。') : null,
            h('div', { style: S.row },
              button('上一张', () => run('preview', { emotion, ...(collection ? { collection } : {}), currentId: preview.id, step: -1 }),
                dirty || !state.config.enabled || !emotion || preview.navigation !== true || preview.candidateCount <= 1),
              h('span', { role: 'status', 'aria-live': 'polite' }, preview.position + ' / ' + preview.candidateCount),
              button('下一张', () => run('preview', { emotion, ...(collection ? { collection } : {}), currentId: preview.id, step: 1 }),
                dirty || !state.config.enabled || !emotion || preview.navigation !== true || preview.candidateCount <= 1)),
          ) : null,
          counts('素材组 / 人物', stats.collections),
          h('details', { style: S.details },
            h('summary', { style: S.summary }, '全部情绪分布'),
            h('table', { style: S.table },
              h('thead', null, h('tr', null, ['情绪', '数量', '情绪', '数量'].map((label, i) => h('th', { key: i, scope: 'col', style: S.cell }, label)))),
              h('tbody', null, emotionRows.map((pair, i) => h('tr', { key: i }, pair.flatMap(([name, count], j) => [
                h('th', { key: 'name' + j, scope: 'row', style: S.cell }, name), h('td', { key: 'count' + j, style: S.cell }, count),
              ])))))),
        ) : null,
        draft ? h('details', { style: S.details, open: !stats },
          h('summary', { style: S.summary }, '素材库 / Python 配置'),
          h('fieldset', { disabled: !!busy, style: { border: 0, padding: 0, margin: 0, minWidth: 0 } },
            h('legend', { style: S.hint }, '使用现有 Python，无需新增依赖。'),
            h('label', { style: S.field }, '素材库路径',
              h('input', { type: 'text', style: S.control, value: draft.libraryPath, onChange: (e) => edit('libraryPath', e.target.value) })),
            h('label', { style: S.field }, 'Python 路径',
              h('input', { type: 'text', style: S.control, value: state.config.pythonPath, readOnly: true })),
            h('p', { style: S.hint }, 'Python 路径仅供查看。如需修改，请在本机编辑 $DSH_HOME/stickers/config.json；网页不能设置可执行程序。'),
          ),
        ) : null,
      )
    }

    function apply(ctx) {
      const slots = ctx.get('slots')
      if (slots === undefined) return
      slots.inject('settings.section', () => slots.register(
        { name: 'settings.section', id: 'stickers', label: () => '表情包', order: 54 }, Section,
      ))
    }
    return { apply, inject }
  },
})
