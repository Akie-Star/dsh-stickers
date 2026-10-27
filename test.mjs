import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'

const home = mkdtempSync(join(tmpdir(), 'dsh-stickers-test-'))
const python = process.env.STICKER_TEST_PYTHON || process.env.DSH_PYTHON || (process.platform === 'win32' ? join(process.env.USERPROFILE, '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe') : 'python3')
process.env.DSH_HOME = home
const library = join(home, '素材 空格 (测试)')
mkdirSync(library)
const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
for (const name of ['a.gif', 'b.gif', 'c.gif', 'd.gif']) writeFileSync(join(library, name), gif)
const items = [
  { id: 'a', label: '问号', category: '疑惑', collection: '甲', relativePath: 'a.gif', autoEligible: false },
  { id: 'b', label: '疑惑', category: '疑惑', collection: '乙', relativePath: 'b.gif' },
  { id: 'c', label: '困了', category: '困倦', collection: '乙', relativePath: 'c.gif' },
  { id: 'd', label: '困惑', category: '疑惑', collection: '乙', relativePath: 'd.gif' },
  { id: 'gone', label: '问号', category: '疑惑', collection: '甲', relativePath: 'missing.gif' },
]
writeFileSync(join(library, 'CATALOG.json'), JSON.stringify({ items }))
mkdirSync(join(home, 'stickers'))
const configPath = join(home, 'stickers/config.json')
writeFileSync(configPath, JSON.stringify({ enabled: true, libraryPath: library, pythonPath: python }))
const { apply, inject } = await import('./host.js')
assert.ok(inject.includes('connection'), 'host authentication service is a required dependency')
const tools = new Map(), routes = [], cleanups = []
let rejectionOverride, missingConnection = false
const connection = { requestRejection(req) {
  if (rejectionOverride !== undefined) return rejectionOverride
  if (req.headers.cookie !== 'session=test-owner') return 401
  if (req.headers.origin !== undefined && req.headers.origin !== 'http://' + req.headers.host) return 403
} }
apply({ get: name => name === 'connection' && !missingConnection ? connection : undefined, effect: fn => { const off = fn(); if (off) cleanups.push(off) }, tools: { register(tool) { assert.equal(tool.parameters.type, 'object'); tools.set(tool.name, tool); return () => tools.delete(tool.name) } }, webServer: { register(route) { routes.push(route); return () => {} } } })
assert.deepEqual([...tools.keys()], ['sticker_pick', 'sticker_status'])
const server = createServer(routes[0].handler)
await new Promise(done => server.listen(0, '127.0.0.1', done))
const base = 'http://127.0.0.1:' + server.address().port + '/dsh-stickers'
const request = async (path, body, headers = {}) => {
  const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: 'session=test-owner', ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, data: await response.json() }
}
try {
  const originalConfig = readFileSync(configPath, 'utf8')
  for (const [path, body] of [['/state', undefined], ['/state', {}], ['/config', { enabled: false }], ['/preview', { emotion: '疑惑' }], ['/image?id=a', undefined]]) {
    assert.equal((await request(path, body, { cookie: '' })).status, 401, path + ' requires host authentication')
    assert.equal((await request(path, body, { origin: 'https://attacker.example' })).status, 403)
    assert.equal((await request(path, body, { 'sec-fetch-site': 'cross-site' })).status, 403)
    assert.equal((await request(path, body, { 'sec-fetch-site': 'same-site' })).status, 403)
    rejectionOverride = 403
    assert.equal((await request(path, body)).status, 403, 'host denial is preserved')
    rejectionOverride = undefined
    missingConnection = true
    assert.equal((await request(path, body)).status, 403, 'missing authentication service fails closed')
    missingConnection = false
  }
  for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
    assert.equal((await request('/config', { enabled: false }, { 'content-type': contentType })).status, 415)
  }
  assert.equal((await request('/config', { pythonPath: process.execPath })).status, 400)
  assert.equal((await request('/config', { pythonPath: python })).status, 400, 'even unchanged executable fields are not web-editable')
  assert.equal(readFileSync(configPath, 'utf8'), originalConfig, 'refused requests never mutate settings')
  const state = (await request('/state', undefined, { origin: new URL(base).origin, 'sec-fetch-site': 'same-origin' })).data
  assert.equal(state.stats.total, 5); assert.equal(state.stats.available, 4); assert.equal(state.stats.missing, 1)
  assert.deepEqual(state.stats.collections, { 甲: 1, 乙: 3 })
  const preview = (await request('/preview', { emotion: '疑惑', collection: '甲' })).data
  assert.equal(preview.id, 'a'); assert.equal(preview.candidateCount, 1); assert.equal(preview.position, 1); assert.equal(preview.navigation, true)
  for (const [currentId, step, id, position] of [['a', 1, 'b', 2], ['b', -1, 'a', 1], ['a', -1, 'd', 3], ['d', 1, 'a', 1]]) {
    const nav = (await request('/preview', { emotion: '疑惑', currentId, step })).data
    assert.equal(nav.id, id); assert.equal(nav.position, position); assert.equal(nav.candidateCount, 3)
  }
  for (const step of [-1, 1]) assert.equal((await request('/preview', { emotion: '疑惑', collection: '甲', currentId: 'a', step })).data.id, 'a')
  assert.equal((await request('/preview', { emotion: '疑惑', collection: '乙', currentId: 'b', step: 1 })).data.id, 'd')
  assert.equal((await request('/preview', { emotion: '疑惑', currentId: 'deleted', step: 1 })).data.id, 'a')
  assert.equal((await request('/preview', { emotion: '疑惑', collection: '不存在', currentId: 'a', step: 1 })).data.matches, 0)
  for (const nav of [{ step: 1 }, { currentId: 'a' }, { currentId: 'a', step: 0 }, { currentId: 'a', step: '1' }, { currentId: '../x\n', step: 1 }]) {
    assert.equal((await request('/preview', { emotion: '疑惑', ...nav })).status, 400)
  }
  assert.match(preview.markdown, /!\[问号\]\(<.*素材 空格 \(测试\).*a.gif>\)/)
  const image = await fetch('http://127.0.0.1:' + server.address().port + preview.previewUrl, { headers: { cookie: 'session=test-owner' } })
  assert.equal(image.headers.get('content-type'), 'image/gif')
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), gif)
  const usagePath = join(home, 'feiyu-chat/sticker-usage.json')
  assert.throws(() => readFileSync(usagePath), { code: 'ENOENT' }, 'preview must not record selection')
  const pick = await tools.get('sticker_pick').execute({ emotion: '疑惑' })
  assert.deepEqual(Object.keys(pick), ['markdown'], 'model receives only the Markdown it needs')
  assert.match(pick.markdown, /![\s\S]+\.gif>\)/)
  assert.equal(JSON.parse(readFileSync(usagePath)).length, 1)
  const sleepy = await tools.get('sticker_pick').execute({ emotion: '困' })
  assert.match(sleepy.markdown, /c\.gif>\)/)
  const compactState = await tools.get('sticker_status').execute()
  assert.equal(compactState.enabled, true); assert.equal(compactState.available, 4)
  assert.deepEqual(compactState.emotions, state.stats.emotions)
  assert.deepEqual(compactState.collections, state.stats.collections)
  assert.equal('config' in compactState || 'version' in compactState, false, 'paths and UI metadata stay out of model context')
  assert.ok(tools.get('sticker_pick').description.length < 240, 'keep repeated tool instructions short')
  assert.ok(!tools.get('sticker_pick').parameters.properties.emotion.description.includes('先从'), 'do not force a status call before every selection')
  assert.equal((await tools.get('sticker_pick').execute({ emotion: '不存在' })).matches, 0)
  assert.equal((await tools.get('sticker_pick').execute({ emotion: '' })).ok, false)
  assert.equal((await request('/preview', { emotion: '疑惑', collection: '不存在' })).data.matches, 0)
  const before = readFileSync(configPath, 'utf8')
  assert.equal((await request('/config', { libraryPath: join(home, 'missing') })).status, 400)
  assert.equal(readFileSync(configPath, 'utf8'), before, 'bad settings must not replace working config')
  assert.equal((await request('/config', { unknown: true })).status, 400)
  assert.equal((await request('/config', { enabled: 'false' })).status, 400)
  const saved = (await request('/config', { enabled: false })).data.config
  assert.equal(saved.enabled, false)
  assert.equal(saved.pythonPath, python, 'ordinary web saves preserve the local executable')
  assert.equal((await tools.get('sticker_pick').execute({ emotion: '疑惑' })).ok, false)
  assert.equal((await request('/preview', { emotion: '疑惑' })).data.ok, false)
  const outside = join(home, 'outside.gif')
  writeFileSync(outside, gif)
  items.push({ id: 'escape', label: '疑惑', category: '疑惑', relativePath: '../outside.gif' })
  writeFileSync(join(library, 'CATALOG.json'), JSON.stringify({ items }))
  assert.equal((await request('/image?id=escape')).status, 400)
  assert.equal((await request('/image?id=not-an-id')).status, 404)
  assert.equal((await tools.get('sticker_status').execute()).error.includes('素材路径超出素材库'), true)
  console.log('PASS: required host authentication, all-route 401/403 fences, fail-closed service, browser origins, JSON-only writes, web executable rejection/local preservation, tools, preview/navigation, GIF bytes, config rollback, disabled gate, path containment; no QQ sends')
} finally {
  for (const cleanup of cleanups.reverse()) cleanup()
  await new Promise(done => server.close(done))
  // Verified target: the unique test directory created at the top of this test.
  assert.equal(resolve(home).startsWith(resolve(tmpdir()) + (process.platform === 'win32' ? '\\' : '/')), true)
  rmSync(home, { recursive: true, force: true })
}
