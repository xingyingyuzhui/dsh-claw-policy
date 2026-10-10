import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as publicSchema from 'dsh-claw-policy/schema'
import { POLICY_SCHEMA_VERSION } from '../policy-schema.mjs'
import {
  emptyDefaults,
  loadDefaults,
  loadDefaultsSync,
  mcpVisible,
  normalizeDefaults,
  readTemplateSeedsSync,
  saveDefaults,
  writeTemplateSeed,
} from '../policy-store.mjs'

test('defaults normalize and persist', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-'))
  const file = join(dir, 'defaults.json')
  assert.equal(emptyDefaults().mcp, 'init-defaults')
  assert.equal(emptyDefaults().preset, 'research')
  assert.equal(emptyDefaults().model, null)
  const saved = await saveDefaults(file, { preset: 'developer', mcp: 'explicit', servers: { allow: ['github'], deny: [' slack '] } })
  assert.equal(saved.preset, 'developer')
  assert.equal(saved.mcp, 'explicit')
  assert.equal(saved.policy.preset, 'developer')
  assert.deepEqual(saved.skills.deny, [])
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
  assert.equal(normalizeDefaults({ preset: 'full' }).preset, 'research')
  assert.equal(normalizeDefaults({ preset: 'developer' }).preset, 'developer')
})

test('policy schema is reachable through the public package export', () => {
  assert.equal(publicSchema.POLICY_SCHEMA_VERSION, POLICY_SCHEMA_VERSION)
  assert.equal(typeof publicSchema.normalizePolicy, 'function')
  assert.equal(typeof publicSchema.intersectPolicies, 'function')
})

test('new template-default writes carry schemaVersion', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-ver-'))
  const file = join(dir, 'agent-policy', 'defaults.json')
  assert.equal(emptyDefaults().schemaVersion, POLICY_SCHEMA_VERSION)
  await saveDefaults(file, { preset: 'developer' })
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.schemaVersion, POLICY_SCHEMA_VERSION)
  assert.deepEqual((await readdir(join(dir, 'agent-policy'))).filter((name) => name.endsWith('.tmp')), [])
})

test('legacy record without schemaVersion reads as v1 and is not rewritten', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-legacy-'))
  const file = join(dir, 'defaults.json')
  const legacy = JSON.stringify({ version: 1, preset: 'developer', mcp: 'explicit', futureFlag: { keep: true } }, null, 2) + '\n'
  await writeFile(file, legacy)
  const before = await stat(file)
  const loaded = await loadDefaults(file)
  const loadedSync = loadDefaultsSync(file)
  assert.equal(loaded.schemaVersion, 1)
  assert.equal(loaded.preset, 'developer')
  assert.deepEqual(loaded.futureFlag, { keep: true })
  assert.deepEqual(loadedSync, loaded)
  assert.equal(await readFile(file, 'utf8'), legacy)
  assert.equal((await stat(file)).mtimeMs, before.mtimeMs)
})

test('user save preserves unknown fields from disk and from the payload', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-unknown-'))
  const file = join(dir, 'defaults.json')
  await writeFile(file, JSON.stringify({
    preset: 'research',
    futureFlag: { keep: true },
    policy: { preset: 'research', futurePolicyKnob: 'on' },
  }))
  const loaded = await loadDefaults(file)
  assert.equal(loaded.policy.futurePolicyKnob, 'on')
  await saveDefaults(file, { ...loaded, preset: 'developer', policy: { ...loaded.policy, preset: 'developer' } })
  const raw = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(raw.schemaVersion, POLICY_SCHEMA_VERSION)
  assert.equal(raw.preset, 'developer')
  assert.deepEqual(raw.futureFlag, { keep: true })
  assert.equal(raw.policy.futurePolicyKnob, 'on')

  await saveDefaults(file, { mcp: 'none', extra: 1 })
  const partial = JSON.parse(await readFile(file, 'utf8'))
  assert.deepEqual(partial.futureFlag, { keep: true })
  assert.equal(partial.extra, 1)
  assert.equal(partial.mcp, 'none')
})

test('save refuses to downgrade a record from a newer schema', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dap-newer-'))
  const file = join(dir, 'defaults.json')
  const newer = JSON.stringify({ schemaVersion: POLICY_SCHEMA_VERSION + 1, preset: 'developer', v2Only: [1] }) + '\n'
  await writeFile(file, newer)
  const loaded = await loadDefaults(file)
  assert.equal(loaded.schemaVersion, POLICY_SCHEMA_VERSION + 1)
  await assert.rejects(() => saveDefaults(file, { preset: 'research' }), (error) => {
    assert.equal(error.code, 'POLICY_SCHEMA_UNSUPPORTED')
    assert.equal(error.status, 409)
    return true
  })
  await assert.rejects(() => saveDefaults(join(dir, 'fresh.json'), { schemaVersion: POLICY_SCHEMA_VERSION + 1 }))
  assert.equal(await readFile(file, 'utf8'), newer)
})

test('template seed writes are atomic and stay in the seeds dir', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dap-seed-'))
  assert.equal(await writeTemplateSeed(home, '../escape.md', 'x'), false)
  assert.equal(await writeTemplateSeed(home, 'SOUL.md', 'seeded soul\n'), true)
  assert.equal(readTemplateSeedsSync(home)['SOUL.md'], 'seeded soul\n')
  const names = await readdir(join(home, 'agent-policy', 'seeds'))
  assert.deepEqual(names, ['SOUL.md'])
  await mkdir(join(home, 'agent-policy', 'seeds', 'AGENTS.md'))
  await assert.rejects(() => writeTemplateSeed(home, 'AGENTS.md', 'x'))
  assert.deepEqual((await readdir(join(home, 'agent-policy', 'seeds'))).sort(), ['AGENTS.md', 'SOUL.md'])
})
