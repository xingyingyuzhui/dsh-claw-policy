import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject, name } from '../host.js'

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
