// Run: node plugins/dsh-stickers/test-client.mjs
import fs from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'

const values = [], refs = [], calls = []
let index = 0, refIndex = 0, effect, cleanup, Section, registration, loaded
const React = {
  createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(x => x != null) }),
  useState: initial => {
    const i = index++
    if (!(i in values)) values[i] = initial
    return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next }]
  },
  useRef: initial => refs[refIndex++] ||= { current: initial },
  useCallback: fn => fn,
  useEffect: fn => { effect ||= fn },
}
const state = {
  ok: true,
  config: { enabled: true, libraryPath: 'C:/stickers', pythonPath: 'python' },
  stats: { total: 3, available: 2, missing: 1, collections: { '大肥鱼': 1, '李安': 2 }, emotions: { '开心': 3, '疑惑': 0, '困倦': 1 } },
}
let reply = { ok: true, config: { ...state.config, libraryPath: '' }, error: '请设置素材库路径' }
const context = {
  URL, AbortController,
  window: { location: { origin: 'http://localhost' }, __ModuleLoader__: { load: x => { loaded = x } } },
  fetch: async (url, options) => {
    calls.push({ url, options })
    return { ok: true, status: 200, json: async () => reply }
  },
}
vm.runInNewContext(fs.readFileSync(new URL('./client.js', import.meta.url), 'utf8'), context)
assert.equal(loaded.id, 'dsh-stickers')
const plugin = loaded.factory(name => { assert.equal(name, 'react'); return React })
assert.equal(JSON.stringify(plugin.inject), '["slots"]')
plugin.apply({ get: () => ({
  inject: (name, fn) => { assert.equal(name, 'settings.section'); fn() },
  register: (meta, component) => { registration = meta; Section = component },
}) })
assert.equal(registration.id, 'stickers')
assert.equal(registration.order, 54)
assert.equal(registration.label(), '表情包')
const render = () => { index = refIndex = 0; return Section() }
const all = node => !node || typeof node !== 'object' ? [] : [node, ...node.children.flatMap(all)]
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children || []).map(text).join('')
const button = (tree, label) => all(tree).find(x => x.type === 'button' && text(x) === label)
const details = (tree, label) => all(tree).find(x => x.type === 'details' && text(x.children[0]) === label)

render()
cleanup = effect()
await new Promise(resolve => setImmediate(resolve))
let tree = render()
assert.equal(calls[0].url, '/dsh-stickers/state')
assert.match(text(tree), /请设置素材库路径/)
const paths = all(tree).filter(x => x.type === 'input' && x.props.type === 'text')
assert.equal(paths.length, 2, 'missing stats must not hide config fields')
assert.equal(paths[1].props.readOnly, true, 'executable path is read-only')
assert.equal(paths[1].props.onChange, undefined, 'browser cannot edit executable path')
assert.equal(details(tree, '素材库 / Python 配置').props.open, true, 'missing stats must expand repair settings')
assert.equal(button(tree, '保存设置').props.disabled, true, 'unchanged config must not be saved')
paths[0].props.onChange({ target: { value: 'C:/stickers' } })
assert.equal(button(render(), '保存设置').props.disabled, false)
assert.match(text(render()), /未保存/)
reply = state
await button(render(), '保存设置').props.onClick()
tree = render()
assert.equal(JSON.parse(calls.at(-1).options.body).libraryPath, 'C:/stickers')
assert.equal('pythonPath' in JSON.parse(calls.at(-1).options.body), false, 'save excludes executable path')
assert.match(text(tree), /总数：3/)
assert.equal(button(tree, '保存设置').props.disabled, true)
assert.equal(details(tree, '素材库 / Python 配置').props.open, false)
assert.ok(!details(tree, '全部情绪分布').props.open, 'emotion distribution starts collapsed')
const table = all(details(tree, '全部情绪分布')).find(x => x.type === 'table')
assert.ok(table)
assert.deepEqual(all(table).filter(x => x.type === 'thead').flatMap(x => all(x).filter(x => x.type === 'th').map(x => [text(x), x.props.scope])), [['情绪', 'col'], ['数量', 'col'], ['情绪', 'col'], ['数量', 'col']])
const tableBody = all(table).find(x => x.type === 'tbody')
assert.deepEqual(tableBody.children.map(row => row.children.map(text)), [['开心', '3', '疑惑', '0'], ['困倦', '1', '', '']])
assert.ok(tableBody.children.every(row => row.children.length === 4), 'four columns, including an empty final pair for odd emotion counts')
assert.equal(tableBody.children[0].children[0].props.scope, 'row')
assert.equal(tableBody.children[0].children[1].type, 'td')
assert.ok(!button(tree, '上一张') && !button(tree, '下一张'), 'no preview means no navigation')
assert.ok(all(tree).findIndex(x => x.type === 'select') < all(tree).findIndex(x => x.type === 'details'), 'preview precedes low-frequency sections')
assert.equal(all(tree).filter(x => x.type === 'select')[1].props.value, '')
assert.equal(text(all(tree).filter(x => x.type === 'select')[1].children[0]), '全部人物')
const preview = { ok: true, navigation: true, id: 'animated_gif', previewUrl: '/dsh-stickers/image?id=animated_gif', label: 'test', category: '开心', collection: '大肥鱼', matches: 3, position: 1, candidateCount: 3 }
reply = preview
for (const origin of ['http://localhost', 'dsh://desktop', 'null']) {
  context.window.location.origin = origin
  await button(render(), '仅预览').props.onClick()
  tree = render()
  assert.equal(all(tree).find(x => x.type === 'img').props.src, reply.previewUrl, 'preview must keep host-relative URLs under HTTP and desktop protocols')
}
delete context.window.location
await button(render(), '仅预览').props.onClick()
tree = render()
assert.equal(all(tree).find(x => x.type === 'img').props.src, preview.previewUrl, 'preview does not require window.location')
assert.equal(calls.at(-1).url, '/dsh-stickers/preview')
assert.equal(JSON.parse(calls.at(-1).options.body).emotion, '开心')
assert.ok(!('collection' in JSON.parse(calls.at(-1).options.body)))
assert.match(text(tree), /1 \/ 3/)
assert.deepEqual(all(tree).find(x => x.type === 'figure').children.at(-1).children.map(text), ['上一张', '1 / 3', '下一张'])
const firstNavigation = calls.length
for (const [label, step] of [['上一张', -1], ['下一张', 1]]) {
  reply = { ...preview, id: 'other', previewUrl: '/dsh-stickers/image?id=other', position: step === -1 ? 3 : 2 }
  await button(render(), label).props.onClick()
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { emotion: '开心', currentId: step === -1 ? preview.id : 'other', step })
  assert.match(text(render()), new RegExp(reply.position + ' / 3'))
}
all(render()).filter(x => x.type === 'select')[1].props.onChange({ target: { value: '大肥鱼' } })
assert.ok(!all(render()).some(x => x.type === 'img'), 'changing collection clears preview')
assert.ok(!button(render(), '下一张'))
reply = preview
await button(render(), '仅预览').props.onClick()
assert.deepEqual(JSON.parse(calls.at(-1).options.body), { emotion: '开心', collection: '大肥鱼' })
for (const [label, step] of [['上一张', -1], ['下一张', 1]]) {
  await button(render(), label).props.onClick()
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { emotion: '开心', collection: '大肥鱼', currentId: preview.id, step })
}
let finishNavigation
reply = new Promise(resolve => { finishNavigation = resolve })
const navigating = button(render(), '下一张').props.onClick()
tree = render()
assert.equal(all(tree).find(x => x.type === 'img').props.src, preview.previewUrl, 'navigation keeps the image while busy')
assert.equal(button(tree, '上一张').props.disabled, true)
assert.equal(button(tree, '下一张').props.disabled, true)
finishNavigation({ ok: false, error: 'navigation failed' })
await navigating
tree = render()
assert.match(text(tree), /navigation failed/)
assert.equal(all(tree).find(x => x.type === 'img').props.src, preview.previewUrl, 'failed navigation keeps the old preview')
assert.equal(button(tree, '下一张').props.disabled, false, 'failed navigation can be retried')
reply = { ...preview, matches: 1, candidateCount: 1 }
await button(tree, '下一张').props.onClick()
tree = render()
assert.match(text(tree), /1 \/ 1/)
assert.equal(button(tree, '上一张').props.disabled, true)
assert.equal(button(tree, '下一张').props.disabled, true)
assert.ok(calls.slice(firstNavigation).every(x => x.url === '/dsh-stickers/preview'), 'navigation and drawing make only preview requests')
all(tree).filter(x => x.type === 'select')[0].props.onChange({ target: { value: '' } })
assert.ok(!all(render()).some(x => x.type === 'img'), 'changing emotion clears preview')
assert.ok(!button(render(), '上一张'))
all(render()).filter(x => x.type === 'select')[0].props.onChange({ target: { value: '开心' } })
reply = { ...preview, navigation: undefined }
await button(render(), '仅预览').props.onClick()
assert.match(text(render()), /请重启 DSH/)
assert.equal(button(render(), '上一张').props.disabled, true)
assert.equal(button(render(), '下一张').props.disabled, true)
reply = preview
await button(render(), '仅预览').props.onClick()
reply = { ok: true, matches: 0 }
await button(render(), '下一张').props.onClick()
assert.ok(!all(render()).some(x => x.type === 'img'), 'no candidates clears even a navigation preview')
assert.match(text(render()), /没有候选图片/)
reply = preview
await button(render(), '仅预览').props.onClick()
const drawing = button(render(), '仅预览').props.onClick()
assert.ok(!all(render()).some(x => x.type === 'img'), 'ordinary drawing clears the old preview while busy')
await drawing
tree = render()
all(tree).find(x => x.type === 'img').props.onError()
assert.match(text(render()), /图片加载失败/)
assert.ok(!all(render()).some(x => x.type === 'img'))
for (const previewUrl of ['https://elsewhere.test/a.gif', '//elsewhere.test/a.gif', '/other-route?id=x', '/dsh-stickers/image?id=']) {
  reply = { ok: true, previewUrl }
  await button(render(), '仅预览').props.onClick()
  assert.match(text(render()), /插件图片接口/)
  assert.ok(!all(render()).some(x => x.type === 'img'))
}
reply = { ok: true }
await button(render(), '仅预览').props.onClick()
assert.match(text(render()), /previewUrl/)
reply = { ok: true, matches: 0 }
await button(tree, '仅预览').props.onClick()
tree = render()
assert.match(text(tree), /没有候选图片/)
assert.ok(!all(tree).some(x => x.type === 'img'))
reply = { ok: false, error: 'test error' }
await button(tree, '仅预览').props.onClick()
tree = render()
assert.match(text(tree), /test error/)
reply = preview
await button(tree, '仅预览').props.onClick()
reply = state
const refreshing = button(render(), '刷新状态').props.onClick()
assert.ok(!all(render()).some(x => x.type === 'img'), 'refresh clears preview immediately')
await refreshing
reply = preview
await button(render(), '仅预览').props.onClick()
tree = render()
const library = all(tree).find(x => x.type === 'input' && x.props.type === 'text')
library.props.onChange({ target: { value: 'C:/changed' } })
assert.equal(button(render(), '仅预览').props.disabled, true, 'unsaved paths block preview even while enabled')
assert.ok(!all(render()).some(x => x.type === 'img'), 'config edits clear preview')
assert.ok(!button(render(), '上一张') && !button(render(), '下一张'), 'unsaved settings cannot navigate')
library.props.onChange({ target: { value: state.config.libraryPath } })
assert.equal(button(render(), '保存设置').props.disabled, true, 'reverting an edit restores clean state')
all(tree).find(x => x.type === 'input' && x.props.type === 'checkbox').props.onChange({ target: { checked: false } })
tree = render()
assert.equal(button(tree, '仅预览').props.disabled, true)
reply = { ...state, config: { ...state.config, enabled: false } }
await button(tree, '保存设置').props.onClick()
tree = render()
assert.equal(JSON.parse(calls.at(-1).options.body).enabled, false)
assert.equal(button(tree, '仅预览').props.disabled, true)
assert.ok(!button(tree, '上一张') && !button(tree, '下一张'), 'disabled plugin cannot navigate')
assert.ok(calls.every(({ url }) => /^\/dsh-stickers\/(state|config|preview)$/.test(url)), 'no QQ send endpoint may be called')
const requests = []
context.fetch = async (url, options) => new Promise(resolve => { requests.push({ resolve, signal: options.signal }) })
const pending = button(tree, '刷新状态').props.onClick()
assert.equal(render().props['aria-busy'], true)
assert.ok(all(render()).filter(x => x.type === 'button').every(x => x.props.disabled))
assert.ok(all(render()).filter(x => x.type === 'select').every(x => x.props.disabled))
const newer = button(render(), '读取中…').props.onClick()
assert.equal(requests[0].signal.aborted, true)
const before = JSON.stringify(values)
requests[0].resolve({ ok: true, status: 200, json: async () => state })
await pending
assert.equal(JSON.stringify(values), before, 'older response must not update state even if fetch ignores abort')
cleanup()
assert.equal(requests[1].signal.aborted, true)
requests[1].resolve({ ok: true, status: 200, json: async () => state })
await newer
assert.equal(JSON.stringify(values), before, 'unmounted request must not update state')
console.log('PASS: registration, native folds and emotion table, clean/dirty save, missing-stats repair, default-all, HTTP/desktop/opaque-origin preview, bidirectional navigation and positions, single-candidate/busy guards, preserved preview on navigation failure, filter/config/refresh clearing, no QQ send, image/API errors, abort and stale/unmount cancellation')
