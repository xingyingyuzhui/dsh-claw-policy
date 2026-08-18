import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AGENT_PRESET_IDS,
  INIT_PRESET,
  POLICY_SCHEMA_VERSION,
  PRESET_IDS,
  allowTool,
  applyPreset,
  clampClawPolicy,
  clampPolicy,
  classifyTool,
  intersectPolicies,
  isToolEnabled,
  maxPolicy,
  normalizePolicy,
  officialPolicyFromPreset,
  optionAllowed,
  toggleTool,
} from '../policy-schema.mjs'

test('schema version and research default', () => {
  assert.equal(POLICY_SCHEMA_VERSION, 1)
  assert.equal(INIT_PRESET, 'research')
  assert.ok(PRESET_IDS.includes('full'))
  assert.equal(AGENT_PRESET_IDS.includes('full'), false)
  const policy = normalizePolicy({})
  assert.equal(policy.preset, 'research')
  assert.equal(policy.files.write, 'none')
  assert.equal(policy.enforced, false)
  assert.equal(isToolEnabled(policy, 'bash'), false)
  assert.deepEqual(policy.delegation.roles, [])
})

test('applyPreset and toggleTool are independent faces', () => {
  const dev = applyPreset('developer')
  assert.equal(dev.files.write, 'workspace')
  assert.equal(isToolEnabled(dev, 'bash'), true)
  assert.deepEqual(dev.delegation.roles, ['research', 'reviewer'])
  const off = toggleTool(dev, 'bash', false)
  assert.equal(isToolEnabled(off, 'bash'), false)
  assert.equal(off.files.write, 'workspace')
})

test('tighter-wins intersection and official mapping', () => {
  const official = officialPolicyFromPreset('danger-full-access')
  const agent = applyPreset('research')
  const ceiling = intersectPolicies(official, agent)
  assert.equal(ceiling.files.write, 'none')
  assert.equal(ceiling.shell, 'deny')
  assert.equal(isToolEnabled(ceiling, 'bash'), false)
  assert.equal(isToolEnabled(ceiling, 'read'), true)
  assert.equal(intersectPolicies(officialPolicyFromPreset('read-only'), applyPreset('developer')).files.write, 'none')
  assert.equal(optionAllowed(ceiling, 'shell', 'allow'), false)
  assert.equal(optionAllowed(ceiling, 'shell', 'deny'), true)
  const clamped = clampPolicy(applyPreset('developer'), ceiling)
  assert.equal(clamped.files.write, 'none')
  assert.equal(allowTool(ceiling, 'bash'), false)
  assert.equal(allowTool(ceiling, 'read_file'), true)
  assert.equal(allowTool(official, 'deploy'), true)
  assert.deepEqual(official.tools.deny, [])
  assert.equal(classifyTool('apply_patch'), 'apply_patch')
  assert.equal(maxPolicy().preset, 'full')
})

test('read-only claw agents lose shell, matching OpenClaw deny group:runtime', () => {
  const sealed = clampClawPolicy({
    preset: 'developer',
    files: { read: 'workspace', write: 'none' },
    shell: 'allowlist',
    tools: { allow: ['read', 'bash'], deny: [] },
  })
  assert.equal(sealed.shell, 'deny')
  assert.equal(isToolEnabled(sealed, 'bash'), false)
  const writer = clampClawPolicy(applyPreset('developer'))
  assert.equal(isToolEnabled(writer, 'bash'), true)
})

test('claw hard cap keeps files all but not unlimited shell', () => {
  const capped = clampClawPolicy(applyPreset('full'))
  assert.equal(capped.files.read, 'all')
  assert.equal(capped.files.write, 'all')
  assert.equal(capped.shell, 'allowlist')
  assert.equal(isToolEnabled(capped, 'deploy'), true)
})
