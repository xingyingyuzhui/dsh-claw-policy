import { defaultsFile, defaultDshHome, loadDefaults, normalizeDefaults, saveDefaults } from './policy-store.mjs'
import { POLICY_SCHEMA_VERSION } from './policy-schema.mjs'

export const name = 'dsh-agent-policy'
export const inject = ['webServer']

const BODY_CAP = 65536
const LOOPBACK_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
let dshHome = defaultDshHome()

const _internal = {
  setDshHome(dir) { dshHome = dir },
  getDshHome() { return dshHome },
}
export { _internal }

const writeJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const readJsonBody = (req, cap = BODY_CAP) => new Promise((resolveBody, reject) => {
  let size = 0
  const chunks = []
  req.on('data', (chunk) => {
    size += chunk.length
    if (size > cap) {
      reject(new Error('body too large'))
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on('end', () => {
    try {
      resolveBody(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')))
    } catch {
      reject(new Error('invalid json body'))
    }
  })
  req.on('error', reject)
})

const guard = (req, res) => {
  if (req.method !== 'POST') {
    writeJson(res, 405, { ok: false, error: 'method not allowed' })
    return false
  }
  const headers = req.headers || {}
  if (headers['x-dsh-agent-policy'] !== '1') {
    writeJson(res, 403, { ok: false, error: 'missing csrf header' })
    return false
  }
  const origin = headers.origin
  if (origin !== undefined && origin !== null && !LOOPBACK_ORIGIN.test(origin)) {
    writeJson(res, 403, { ok: false, error: 'origin not allowed' })
    return false
  }
  return true
}

export function apply(ctx) {
  const handle = (fn) => async (req, res) => {
    if (!guard(req, res)) return
    try {
      const body = await readJsonBody(req)
      await fn(req, res, body)
    } catch (error) {
      writeJson(res, 400, { ok: false, error: String(error && error.message || error) })
    }
  }

  const routes = [
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-policy/defaults',
      handler: handle(async (_req, res) => {
        const defaults = await loadDefaults(defaultsFile(dshHome))
        writeJson(res, 200, { ok: true, schemaVersion: POLICY_SCHEMA_VERSION, defaults })
      }),
    }),
    ctx.webServer.register({
      kind: 'exact',
      path: '/dsh-agent-policy/defaults/write',
      handler: handle(async (_req, res, body) => {
        const defaults = await saveDefaults(defaultsFile(dshHome), normalizeDefaults(body && body.defaults ? body.defaults : body))
        writeJson(res, 200, { ok: true, schemaVersion: POLICY_SCHEMA_VERSION, defaults })
      }),
    }),
  ]

  ctx.effect(() => () => {
    for (let i = 0; i < routes.length; i++) {
      if (typeof routes[i] === 'function') routes[i]()
    }
  })
}
