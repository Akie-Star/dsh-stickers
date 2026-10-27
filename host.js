import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, realpathSync } from 'node:fs'
import { join, dirname, resolve, relative, isAbsolute, extname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'

export const name = 'stickers'
export const inject = ['tools', 'webServer', 'connection']
const HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const CONFIG = join(HOME, 'stickers', 'config.json')
const SELECTOR = fileURLToPath(new URL('./selector.py', import.meta.url))
const VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version
const bundledPython = join(HOME, 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', process.platform === 'win32' ? 'python.exe' : 'bin/python3')
const defaults = { enabled: true, libraryPath: '', pythonPath: existsSync(bundledPython) ? bundledPython : (process.platform === 'win32' ? 'python' : 'python3') }
const executeFile = promisify(execFile)
export const RULES = '先选情绪，再在该类候选中每张等概率抽图；不加权、不限场景、不为偏好重抽。QQ普通回复和主动搭话每个实际轮次仅一张，分条共用，静默不发。将返回的markdown原样独立置于最终正文末尾，空行分隔；有[QQ]块则图同在块内。只选图不发送，交给QQ桥；不解释过程、不编造路径。无匹配才查sticker_status换相近情绪；关闭时不绕过。选图不是投递回执。'

function readConfig() {
  try { return { ...defaults, ...JSON.parse(readFileSync(CONFIG, 'utf8').replace(/^\uFEFF/, '')) } }
  catch (error) { if (error.code === 'ENOENT') return { ...defaults }; throw error }
}
function validateConfig(config) {
  if (typeof config.enabled !== 'boolean') throw new Error('enabled 必须为布尔值')
  for (const key of ['libraryPath', 'pythonPath']) {
    if (typeof config[key] !== 'string' || !config[key].trim() || /[\x00\r\n]/.test(config[key])) throw new Error(`${key} 必须是有效路径`)
  }
  if (!isAbsolute(config.libraryPath)) throw new Error('素材库必须使用绝对路径')
  return { enabled: config.enabled, libraryPath: resolve(config.libraryPath), pythonPath: config.pythonPath.trim() }
}
export async function runSelector(config, args) {
  validateConfig(config)
  const { stdout } = await executeFile(config.pythonPath, [SELECTOR, ...args], {
    windowsHide: true, timeout: 15000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', DSH_STICKER_LIBRARY: config.libraryPath },
  }).catch(error => { throw new Error((error.stderr?.trim().split(/\r?\n/).at(-1) || error.message).slice(0, 400)) })
  return JSON.parse(stdout.trim())
}
async function state(config = readConfig(), stats) {
  try { return { ok: true, version: VERSION, config, stats: stats ?? await runSelector(config, ['--stats']) } }
  catch (error) { return { ok: true, version: VERSION, config, error: error.message } }
}
async function pick(args, preview = false) {
  const config = readConfig()
  if (!config.enabled) throw new Error('表情包插件已关闭')
  if (!args || typeof args.emotion !== 'string' || !args.emotion.trim() || args.emotion.length > 80 || /[\x00\r\n]/.test(args.emotion)) throw new Error('emotion 必须是一个情绪类别')
  if (args.collection !== undefined && (typeof args.collection !== 'string' || args.collection.length > 80 || /[\x00\r\n]/.test(args.collection))) throw new Error('collection 必须是素材组名称')
  const navigating = preview && (args.currentId !== undefined || args.step !== undefined)
  if (navigating && (typeof args.currentId !== 'string' || !args.currentId.trim() || args.currentId.length > 200 || /[\x00\r\n]/.test(args.currentId) || ![-1, 1].includes(args.step))) throw new Error('预览导航需要 currentId 和 step（-1 或 1）')
  const result = await runSelector(config, ['--strict-emotion', preview ? '--preview' : '--pick', ...(args.collection ? ['--collection=' + args.collection] : []), ...(navigating ? ['--current-id=' + args.currentId, '--step=' + args.step] : []), '--', args.emotion.trim()])
  return { ok: true, ...result, ...(preview ? { navigation: true } : {}), ...(result.id ? { previewUrl: '/dsh-stickers/image?id=' + encodeURIComponent(result.id) } : {}) }
}
const safe = async (fn) => { try { return await fn() } catch (error) { return { ok: false, error: error.message } } }
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}
async function bodyOf(req) {
  let data = ''
  for await (const chunk of req) { data += chunk; if (Buffer.byteLength(data) > 16384) throw new Error('请求过大') }
  const body = JSON.parse(data || '{}')
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('请求必须是JSON对象')
  return body
}

export function apply(ctx) {
  const output = { schema: { type: 'object', properties: {}, additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
  ctx.effect(() => ctx.tools.register({
    name: 'sticker_pick', description: RULES,
    parameters: { type: 'object', properties: { emotion: { type: 'string', description: '情绪，如开心、疑惑、困倦、招呼；可直接挑图' }, collection: { type: 'string', description: '仅用户点名人物时填，默认全部' } }, required: ['emotion'], additionalProperties: false },
    output, execute: (args) => safe(async () => {
      const result = await pick(args)
      return result.markdown ? { markdown: result.markdown } : { matches: 0, ...(result.emotions ? { emotions: result.emotions } : {}) }
    }),
  }))
  ctx.effect(() => ctx.tools.register({
    name: 'sticker_status', description: '按需查看开关、素材和情绪分布；不必每轮调用。',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
    execute: () => safe(async () => {
      const { config, stats, error } = await state()
      return { enabled: config.enabled, ...stats, ...(error ? { error } : {}) }
    }),
  }))
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/dsh-stickers', handler: async (req, res) => {
    try {
      // Use the host's session/token authentication; no unauthenticated fallback.
      const connection = ctx.get('connection')
      const refused = typeof connection?.requestRejection === 'function' ? connection.requestRejection(req) : 403
      if (refused !== undefined) return json(res, refused, { ok: false, error: refused === 401 ? '未登录' : '请求未授权' })
      const site = req.headers['sec-fetch-site']
      if (site !== undefined && site !== 'same-origin' && site !== 'none') return json(res, 403, { ok: false, error: '浏览器来源不允许' })
      if (req.method === 'POST' && !/^application\/json\s*(;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, { ok: false, error: '请求必须使用 application/json' })
      const url = new URL(req.url, 'http://localhost')
      const path = url.pathname.slice('/dsh-stickers'.length)
      if (path === '/state' && ['GET', 'POST'].includes(req.method)) return json(res, 200, await state())
      if (path === '/config' && req.method === 'POST') {
        const body = await bodyOf(req)
        // Executable selection is local-admin configuration, never browser input.
        if (Object.hasOwn(body, 'pythonPath')) throw new Error('Python 路径只能在本地配置文件中修改')
        if (Object.keys(body).some(key => !['enabled', 'libraryPath'].includes(key))) throw new Error('未知设置字段')
        const config = validateConfig({ ...readConfig(), ...body })
        const stats = await runSelector(config, ['--stats'])
        mkdirSync(dirname(CONFIG), { recursive: true })
        const temp = CONFIG + '.' + randomUUID() + '.tmp'
        writeFileSync(temp, JSON.stringify(config, null, 2), 'utf8')
        renameSync(temp, CONFIG)
        return json(res, 200, await state(config, stats))
      }
      if (path === '/preview' && req.method === 'POST') return json(res, 200, await pick(await bodyOf(req), true))
      if (path === '/image' && req.method === 'GET') {
        const root = realpathSync(readConfig().libraryPath)
        const catalog = JSON.parse(readFileSync(join(root, 'CATALOG.json'), 'utf8').replace(/^\uFEFF/, ''))
        const row = catalog.items.find(row => row.id === url.searchParams.get('id'))
        if (!row) return json(res, 404, { ok: false, error: '素材不存在' })
        const file = realpathSync(resolve(root, row.relativePath))
        const rel = relative(root, file)
        if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) throw new Error('素材路径超出素材库')
        const mime = { '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }[extname(file).toLowerCase()]
        if (!mime) throw new Error('不支持的图片类型')
        res.writeHead(200, { 'content-type': mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
        return res.end(readFileSync(file))
      }
      json(res, 404, { ok: false, error: '接口不存在' })
    } catch (error) { json(res, 400, { ok: false, error: error.message }) }
  } }))
}
