import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { apply, inject, name, _internal } from '../host.js'

function routeCtx() {
  const routes = []
  return {
    routes,
    connection: { fetch: { register(entry) { routes.push(entry); return () => {} } } },
    effect() {},
  }
}

function post(route, body) {
  return route.fetch(new Request('dsh-app://host' + route.path, { method: 'POST', body: JSON.stringify(body || {}) }))
}

test('host named exports', () => {
  assert.equal(name, 'dsh-claw-policy')
  assert.deepEqual(inject, ['connection'])
})

test('apply registers POST defaults routes and disposes them', () => {
  const routes = []
  const effects = []
  const ctx = {
    connection: {
      fetch: {
        register(entry) {
          routes.push(entry)
          return () => { entry.disposed = true }
        },
      },
    },
    effect(fn) { effects.push(fn) },
  }
  apply(ctx)
  assert.deepEqual(routes.map((row) => row.path), [
    '/api/dsh-claw/policy/defaults',
    '/api/dsh-claw/policy/defaults/write',
  ])
  for (const row of routes) {
    assert.deepEqual(row.methods, ['POST'])
    assert.equal(row.requestBody, 'buffered')
  }
  assert.equal(effects.length, 2)
})

test('startup and read route never rewrite a legacy defaults record', async () => {
  const home = await mkdtemp(join(tmpdir(), 'policy-host-'))
  const dir = join(home, 'agent-policy')
  await mkdir(dir, { recursive: true })
  const legacy = JSON.stringify({ version: 1, preset: 'developer', futureFlag: 'keep' }) + '\n'
  await writeFile(join(dir, 'defaults.json'), legacy)
  const prev = _internal.getDshHome()
  _internal.setDshHome(home)
  try {
    const ctx = routeCtx()
    apply(ctx)
    const read = ctx.routes.find((row) => row.path === '/api/dsh-claw/policy/defaults')
    const write = ctx.routes.find((row) => row.path === '/api/dsh-claw/policy/defaults/write')
    const body = await (await post(read)).json()
    assert.equal(body.ok, true)
    assert.equal(body.defaults.schemaVersion, 1)
    assert.equal(body.defaults.futureFlag, 'keep')
    assert.equal(await readFile(join(dir, 'defaults.json'), 'utf8'), legacy)
    assert.deepEqual(await readdir(dir), ['defaults.json'])

    const next = { ...body.defaults, policy: { ...body.defaults.policy, preset: 'research' } }
    const saved = await (await post(write, { defaults: next })).json()
    assert.equal(saved.ok, true)
    const raw = JSON.parse(await readFile(join(dir, 'defaults.json'), 'utf8'))
    assert.equal(raw.schemaVersion, 1)
    assert.equal(raw.preset, 'research')
    assert.equal(raw.futureFlag, 'keep')

    const newer = await post(write, { defaults: { schemaVersion: 99 } })
    assert.equal(newer.status, 409)
    assert.equal((await newer.json()).code, 'POLICY_SCHEMA_UNSUPPORTED')
  } finally {
    _internal.setDshHome(prev)
  }
})
