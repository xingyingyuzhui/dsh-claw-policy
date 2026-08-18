export const POLICY_SCHEMA_VERSION = 1
export const INIT_PRESET = 'research'

export const AGENT_PRESET_IDS = ['research', 'developer', 'reviewer', 'release', 'public']
export const PRESET_IDS = ['full', 'research', 'developer', 'reviewer', 'release', 'public']
export const TOOL_IDS = ['read', 'write', 'edit', 'apply_patch', 'bash', 'deploy']
export const READ_IDS = ['none', 'workspace', 'all']
export const WRITE_IDS = ['none', 'workspace', 'all']
export const SHELL_IDS = ['deny', 'allowlist', 'allow']
export const APPROVAL_IDS = ['never', 'ask-external', 'ask-always']
export const MCP_IDS = ['none', 'explicit', 'init-defaults']

const PRESETS = {
  full: {
    files: { read: 'all', write: 'all' },
    shell: 'allow',
    tools: { allow: ['read', 'write', 'edit', 'apply_patch', 'bash', 'deploy'], deny: [] },
    delegation: { maxDepth: 8, roles: ['research', 'reviewer', 'developer', 'release', 'public'] },
    approval: 'never',
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
  },
  research: {
    files: { read: 'workspace', write: 'none' },
    shell: 'deny',
    tools: { allow: ['read'], deny: ['write', 'edit', 'apply_patch', 'bash'] },
    delegation: { maxDepth: 1, roles: [] },
    approval: 'never',
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
  },
  developer: {
    files: { read: 'workspace', write: 'workspace' },
    shell: 'allowlist',
    tools: { allow: ['read', 'write', 'edit', 'apply_patch', 'bash'], deny: ['deploy'] },
    delegation: { maxDepth: 1, roles: ['research', 'reviewer'] },
    approval: 'ask-external',
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
  },
  reviewer: {
    files: { read: 'workspace', write: 'none' },
    shell: 'deny',
    tools: { allow: ['read'], deny: ['write', 'edit', 'apply_patch', 'bash', 'deploy'] },
    delegation: { maxDepth: 1, roles: [] },
    approval: 'never',
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
  },
  release: {
    files: { read: 'workspace', write: 'none' },
    shell: 'deny',
    tools: { allow: ['read'], deny: ['write', 'edit', 'apply_patch', 'bash'] },
    delegation: { maxDepth: 1, roles: [] },
    approval: 'ask-always',
    mcp: 'explicit',
    servers: { allow: [], deny: [] },
  },
  public: {
    files: { read: 'none', write: 'none' },
    shell: 'deny',
    tools: { allow: [], deny: ['read', 'write', 'edit', 'apply_patch', 'bash'] },
    delegation: { maxDepth: 0, roles: [] },
    approval: 'never',
    mcp: 'none',
    servers: { allow: [], deny: [] },
  },
}

export function isPresetId(id) {
  return PRESET_IDS.includes(id)
}

export function declaredOf(preset) {
  const id = isPresetId(preset) ? preset : INIT_PRESET
  return { preset: id, enforced: false, ...PRESETS[id] }
}

function pick(list, value, fallback) {
  return list.includes(value) ? value : fallback
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item)
}

export function normalizePolicy(raw, fallbackPreset) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const preset = isPresetId(value.preset) ? value.preset : (isPresetId(fallbackPreset) ? fallbackPreset : INIT_PRESET)
  const base = declaredOf(preset)
  const filesIn = value.files && typeof value.files === 'object' ? value.files : {}
  const toolsIn = value.tools && typeof value.tools === 'object' ? value.tools : {}
  const delegationIn = value.delegation && typeof value.delegation === 'object' ? value.delegation : {}
  const serversIn = value.servers && typeof value.servers === 'object' ? value.servers : {}
  const depth = Number(delegationIn.maxDepth)
  const roles = asStringList(delegationIn.roles)
  return {
    preset,
    enforced: false,
    files: {
      read: pick(READ_IDS, filesIn.read, base.files.read),
      write: pick(WRITE_IDS, filesIn.write, base.files.write),
    },
    shell: pick(SHELL_IDS, value.shell, base.shell),
    tools: {
      allow: Array.isArray(toolsIn.allow) ? asStringList(toolsIn.allow) : base.tools.allow.slice(),
      deny: Array.isArray(toolsIn.deny) ? asStringList(toolsIn.deny) : base.tools.deny.slice(),
    },
    delegation: {
      maxDepth: Number.isFinite(depth) && depth >= 0 ? Math.min(8, Math.floor(depth)) : base.delegation.maxDepth,
      roles: roles.length ? roles : (base.delegation.roles || []).slice(),
    },
    approval: pick(APPROVAL_IDS, value.approval, base.approval),
    mcp: pick(MCP_IDS, value.mcp, base.mcp),
    servers: {
      allow: Array.isArray(serversIn.allow) ? asStringList(serversIn.allow) : (base.servers && base.servers.allow || []).slice(),
      deny: Array.isArray(serversIn.deny) ? asStringList(serversIn.deny) : (base.servers && base.servers.deny || []).slice(),
    },
    skills: {
      deny: asStringList(value.skills && value.skills.deny),
    },
  }
}

export function applyPreset(preset) {
  return normalizePolicy({ preset }, preset)
}

export function isToolEnabled(policy, toolId) {
  const allow = (policy && policy.tools && policy.tools.allow) || []
  const deny = (policy && policy.tools && policy.tools.deny) || []
  if (deny.includes(toolId)) return false
  return allow.includes(toolId)
}

export function toggleTool(policy, toolId, enabled) {
  const next = normalizePolicy(policy)
  const allow = new Set(next.tools.allow)
  const deny = new Set(next.tools.deny)
  if (enabled) {
    allow.add(toolId)
    deny.delete(toolId)
  } else {
    allow.delete(toolId)
    deny.add(toolId)
  }
  next.tools = {
    allow: TOOL_IDS.filter((id) => allow.has(id)),
    deny: TOOL_IDS.filter((id) => deny.has(id)),
  }
  return next
}

const READ_RANK = { none: 0, workspace: 1, all: 2 }
const WRITE_RANK = { none: 0, workspace: 1, all: 2 }
const SHELL_RANK = { deny: 0, allowlist: 1, allow: 2 }
const APPROVAL_RANK = { 'ask-always': 0, 'ask-external': 1, never: 2 }
const MCP_RANK = { none: 0, explicit: 1, 'init-defaults': 2 }

function tighter(rank, left, right) {
  const a = rank[left]
  const b = rank[right]
  if (a == null) return right
  if (b == null) return left
  return a <= b ? left : right
}

export function intersectPolicies(...layers) {
  const list = layers.filter(Boolean).map((row) => normalizePolicy(row))
  if (list.length === 0) return normalizePolicy({ preset: INIT_PRESET })
  return list.reduce((acc, row) => {
    const allow = TOOL_IDS.filter((id) => isToolEnabled(acc, id) && isToolEnabled(row, id))
    return {
      preset: acc.preset,
      enforced: true,
      files: {
        read: tighter(READ_RANK, acc.files.read, row.files.read),
        write: tighter(WRITE_RANK, acc.files.write, row.files.write),
      },
      shell: tighter(SHELL_RANK, acc.shell, row.shell),
      approval: tighter(APPROVAL_RANK, acc.approval, row.approval),
      mcp: tighter(MCP_RANK, acc.mcp, row.mcp),
      servers: intersectMcpServers(acc, row, tighter(MCP_RANK, acc.mcp, row.mcp)),
      tools: {
        allow,
        deny: TOOL_IDS.filter((id) => allow.indexOf(id) < 0),
      },
      delegation: {
        maxDepth: Math.min(acc.delegation.maxDepth, row.delegation.maxDepth),
        roles: (acc.delegation.roles || []).filter((role) => (row.delegation.roles || []).includes(role)),
      },
      skills: {
        deny: [...new Set([
          ...((acc.skills && acc.skills.deny) || []),
          ...((row.skills && row.skills.deny) || []),
        ])],
      },
    }
  })
}

export function officialPolicyFromPreset(name) {
  if (name === 'read-only') return applyPreset('research')
  if (name === 'workspace-write') return applyPreset('developer')
  return applyPreset('full')
}

export function maxPolicy() {
  return applyPreset('full')
}

export function clawHardCap() {
  return normalizePolicy({
    ...applyPreset('developer'),
    files: { read: 'all', write: 'all' },
    tools: { allow: TOOL_IDS.slice(), deny: [] },
  })
}

export function clampPolicy(policy, ceiling) {
  return intersectPolicies(normalizePolicy(policy), normalizePolicy(ceiling))
}

export function sealReadOnlyRuntime(policy) {
  const next = normalizePolicy(policy)
  if (!next.files || next.files.write !== 'none') return next
  if (next.files.read === 'all') return next
  const allow = (next.tools.allow || []).filter((id) => id !== 'bash')
  const deny = (next.tools.deny || []).slice()
  if (deny.indexOf('bash') < 0) deny.push('bash')
  return { ...next, shell: 'deny', tools: { allow, deny } }
}

export function clampClawPolicy(policy) {
  return sealReadOnlyRuntime(clampPolicy(policy, clawHardCap()))
}

export function officialSandboxOf(policy) {
  if (policy && policy.files && policy.files.write === 'all' && policy.shell === 'allow') {
    return 'danger-full-access'
  }
  if (policy && policy.files && policy.files.write !== 'none') return 'workspace-write'
  return 'read-only'
}

export function officialApprovalOf(policy) {
  if (policy && policy.approval === 'never') return 'never'
  return 'ask'
}

export function tighterSandbox(wanted, current) {
  const rank = { 'read-only': 0, 'workspace-write': 1, 'danger-full-access': 2 }
  if (!wanted) return current || null
  if (!current) return wanted
  return rank[wanted] <= rank[current] ? wanted : current
}

export function optionAllowed(ceiling, face, value) {
  const trial = normalizePolicy({
    ...ceiling,
    ...(face === 'files.read' ? { files: { ...ceiling.files, read: value } } : {}),
    ...(face === 'files.write' ? { files: { ...ceiling.files, write: value } } : {}),
    ...(face === 'shell' ? { shell: value } : {}),
    ...(face === 'approval' ? { approval: value } : {}),
    ...(face === 'mcp' ? { mcp: value } : {}),
  })
  const clamped = intersectPolicies(trial, ceiling)
  if (face === 'files.read') return clamped.files.read === value
  if (face === 'files.write') return clamped.files.write === value
  if (face === 'shell') return clamped.shell === value
  if (face === 'approval') return clamped.approval === value
  if (face === 'mcp') return clamped.mcp === value
  return true
}

export function asArgs(args) {
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args)
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }
  return args && typeof args === 'object' && !Array.isArray(args) ? args : {}
}

function commandOf(args) {
  const value = asArgs(args)
  return String(value.command || value.cmd || '').toLowerCase()
}

const OPENCLAW_FS = {
  read: 'read',
  glob: 'read',
  grep: 'read',
  read_file: 'read',
  read_image: 'read',
  write: 'write',
  create_file: 'write',
  edit: 'edit',
  apply_patch: 'apply_patch',
  bash: 'bash',
  exec: 'bash',
  shell: 'bash',
  deploy: 'deploy',
}

export function workspaceAccessOf(policy, cls) {
  if (!policy || !policy.files) return 'none'
  if (cls === 'read') {
    if (policy.files.read === 'all') return 'all'
    if (policy.files.read === 'workspace') return 'ro'
    return 'none'
  }
  if (cls === 'write' || cls === 'edit' || cls === 'apply_patch') {
    if (policy.files.write === 'all') return 'all'
    if (policy.files.write === 'workspace') return 'rw'
    return 'none'
  }
  if (policy.files.read === 'all' || policy.files.write === 'all') return 'all'
  if (policy.files.write === 'workspace') return 'rw'
  if (policy.files.read === 'workspace') return 'ro'
  return 'none'
}

export function mcpServerOf(name) {
  const id = String(name || '')
  if (!id.startsWith('mcp__')) return ''
  const rest = id.slice(5)
  const cut = rest.indexOf('__')
  if (cut <= 0) return ''
  return rest.slice(0, cut)
}

export function isMcpTool(name) {
  const id = String(name || '')
  return id.startsWith('mcp__') || id.toLowerCase().includes('mcp')
}

export function mcpServerAllowed(policy, serverName) {
  const row = policy && typeof policy === 'object' ? policy : {}
  const mcp = MCP_IDS.includes(row.mcp) ? row.mcp : 'init-defaults'
  const servers = row.servers && typeof row.servers === 'object' ? row.servers : {}
  const allow = asStringList(servers.allow)
  const deny = asStringList(servers.deny)
  const server = String(serverName || '').trim()
  if (!server) return false
  if (mcp === 'none') return false
  if (deny.indexOf(server) >= 0) return false
  if (mcp === 'explicit') return allow.indexOf(server) >= 0
  if (allow.length === 0) return true
  return allow.indexOf(server) >= 0
}

function mcpUniverse(policy) {
  if (!policy || policy.mcp === 'none') return []
  const allow = (policy.servers && policy.servers.allow) || []
  const deny = (policy.servers && policy.servers.deny) || []
  if (policy.mcp === 'explicit' && allow.length === 0) return []
  if (allow.length === 0) return null
  return allow.filter((name) => deny.indexOf(name) < 0)
}

function intersectMcpServers(acc, row, mcp) {
  const deny = [...new Set([
    ...((acc.servers && acc.servers.deny) || []),
    ...((row.servers && row.servers.deny) || []),
  ])]
  if (mcp === 'none') return { allow: [], deny }
  const left = mcpUniverse(acc)
  const right = mcpUniverse(row)
  let allow
  if (left === null && right === null) allow = []
  else if (left === null) allow = right.slice()
  else if (right === null) allow = left.slice()
  else allow = left.filter((name) => right.indexOf(name) >= 0)
  return { allow, deny }
}

export function classifyTool(name, args) {
  const id = String(name || '').toLowerCase()
  if (OPENCLAW_FS[id]) return OPENCLAW_FS[id]
  if (id === 'str_replace_editor') {
    const cmd = commandOf(args)
    if (cmd === 'view' || cmd === 'read') return 'read'
    if (cmd === 'create' || cmd === 'write') return 'write'
    return 'edit'
  }
  if (isMcpTool(name)) return 'mcp'
  if (id.includes('subagent') || id.includes('delegate')) return 'other'
  return 'other'
}

export function allowTool(policy, name, args) {
  if (!policy) return false
  const id = String(name || '').toLowerCase()
  if (id === 'skill') return true
  if (isMcpTool(name)) {
    const server = mcpServerOf(name)
    if (!server) return false
    return mcpServerAllowed(policy, server)
  }
  if ((id.includes('subagent') || id.includes('delegate')) && policy.delegation.maxDepth <= 0) {
    return false
  }
  const cls = classifyTool(name, args)
  if (cls === 'other') {
    return policy.files.write !== 'none' || policy.shell !== 'deny'
  }
  if (cls === 'edit' || cls === 'write' || cls === 'apply_patch') {
    if (cls === 'apply_patch') return isToolEnabled(policy, 'apply_patch') || isToolEnabled(policy, 'edit')
    return isToolEnabled(policy, cls)
  }
  return isToolEnabled(policy, cls)
}
