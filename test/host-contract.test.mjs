import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject, name } from '../host.js'

test('host named exports', () => {
  assert.equal(name, 'dsh-agent-policy')
  assert.deepEqual(inject, ['webServer'])
})

test('apply registers POST defaults routes and disposes them', () => {
  const routes = []
  const ctx = {
    webServer: {
      register(entry) {
        routes.push(entry)
        return () => { entry.disposed = true }
      },
    },
    effect(fn) { return fn() },
  }
  apply(ctx)
  assert.deepEqual(routes.map((row) => row.path), [
    '/dsh-agent-policy/defaults',
    '/dsh-agent-policy/defaults/write',
  ])
  for (const row of routes) assert.equal(row.kind, 'exact')
})
