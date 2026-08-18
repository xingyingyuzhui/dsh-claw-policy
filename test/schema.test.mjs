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
  mcpServerOf,
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

test('MCP is its own face and does not follow write/shell', () => {
  const research = applyPreset('research')
  assert.equal(classifyTool('mcp__github__search'), 'mcp')
  assert.equal(mcpServerOf('mcp__github__search'), 'github')
  assert.equal(allowTool(research, 'mcp__github__search'), true)
  assert.equal(allowTool({ ...research, mcp: 'none' }, 'mcp__github__search'), false)
  const explicit = normalizePolicy({
    preset: 'developer',
    mcp: 'explicit',
    servers: { allow: ['github'], deny: [] },
  })
  assert.equal(allowTool(explicit, 'mcp__github__search'), true)
  assert.equal(allowTool(explicit, 'mcp__slack__post'), false)
  const mixed = intersectPolicies(applyPreset('research'), explicit)
  assert.equal(allowTool(mixed, 'mcp__github__search'), true)
  assert.equal(allowTool(mixed, 'mcp__slack__post'), false)
})

test('delegate_handoff accept is apply_patch; list and reject are free', () => {
  const developer = applyPreset('developer')
  const research = applyPreset('research')
  assert.equal(classifyTool('delegate_handoff', { action: 'accept' }), 'apply_patch')
  assert.equal(allowTool(developer, 'delegate_handoff', { action: 'accept' }), true)
  assert.equal(allowTool(research, 'delegate_handoff', { action: 'accept' }), false)
  assert.equal(allowTool(research, 'delegate_handoff', { action: 'list' }), true)
  assert.equal(allowTool(research, 'delegate_handoff', { action: 'reject' }), true)
})

test('unknown tools and explicit empty roles stay closed', () => {
  const dev = applyPreset('developer')
  assert.equal(allowTool(dev, 'send_email'), false)
  assert.equal(allowTool(dev, 'browser_publish'), false)
  assert.equal(allowTool(dev, 'calendar_delete'), false)
  const empty = normalizePolicy({ preset: 'developer', delegation: { roles: [] } })
  assert.deepEqual(empty.delegation.roles, [])
  const kept = normalizePolicy({
    preset: 'developer',
    delegation: { maxDepth: 1, maxChildren: 2, maxOutputBytes: 2048 },
    sandbox: { requireEnforcement: 'full' },
  })
  assert.equal(kept.delegation.maxChildren, 2)
  assert.equal(kept.delegation.maxOutputBytes, 2048)
  assert.equal(kept.sandbox.requireEnforcement, 'full')
  const sealed = clampClawPolicy({
    preset: 'developer',
    files: { read: 'all', write: 'none' },
    shell: 'allowlist',
    tools: { allow: ['read', 'bash'], deny: [] },
  })
  assert.equal(sealed.shell, 'deny')
  assert.equal(isToolEnabled(sealed, 'bash'), false)
})

test('claw hard cap keeps files all but not unlimited shell', () => {
  const capped = clampClawPolicy(applyPreset('full'))
  assert.equal(capped.files.read, 'all')
  assert.equal(capped.files.write, 'all')
  assert.equal(capped.shell, 'allowlist')
  assert.equal(isToolEnabled(capped, 'deploy'), true)
})
