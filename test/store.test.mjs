import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { mcpVisible, normalizeDefaults, saveDefaults, loadDefaults, emptyDefaults } from '../policy-store.mjs'

test('defaults normalize and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-'))
  const file = join(dir, 'defaults.json')
  assert.equal(emptyDefaults().mcp, 'init-defaults')
  const saved = await saveDefaults(file, { mcp: 'explicit', servers: { allow: ['github'], deny: [' slack '] } })
  assert.equal(saved.mcp, 'explicit')
  assert.deepEqual(saved.servers.allow, ['github'])
  assert.deepEqual(saved.servers.deny, ['slack'])
  const loaded = await loadDefaults(file)
  assert.deepEqual(loaded, saved)
})

test('mcpVisible follows none / explicit / init-defaults', () => {
  assert.equal(mcpVisible({ mcp: 'none' }, 'github'), false)
  assert.equal(mcpVisible({ mcp: 'explicit', servers: { allow: ['github'] } }, 'github'), true)
  assert.equal(mcpVisible({ mcp: 'explicit', servers: { allow: ['github'] } }, 'slack'), false)
  assert.equal(mcpVisible({ mcp: 'init-defaults' }, 'anything'), true)
  assert.equal(mcpVisible({ mcp: 'init-defaults', servers: { allow: ['github'] } }, 'slack'), false)
  assert.equal(mcpVisible({ mcp: 'init-defaults', servers: { deny: ['slack'] } }, 'slack'), false)
  assert.equal(normalizeDefaults({ mcp: 'nope' }).mcp, 'init-defaults')
})
