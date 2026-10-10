import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { httpError } from 'dsh-claw-core/http'
import {
  AGENT_PRESET_IDS,
  INIT_PRESET,
  MCP_IDS,
  POLICY_SCHEMA_VERSION,
  clampClawPolicy,
  mcpServerAllowed,
  normalizePolicy,
} from './policy-schema.mjs'

export const TEMPLATE_SEED_FILES = [
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
]

export function defaultDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function defaultsFile(home) {
  return join(home || defaultDshHome(), 'agent-policy', 'defaults.json')
}

export function seedsDir(home) {
  return join(home || defaultDshHome(), 'agent-policy', 'seeds')
}

const DEFAULTS_KEYS = ['schemaVersion', 'preset', 'mcp', 'servers', 'model', 'skills', 'policy']
const POLICY_KEYS = ['preset', 'enforced', 'files', 'shell', 'tools', 'delegation', 'sandbox', 'approval', 'mcp', 'servers', 'skills']

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unknownFields(raw, known) {
  const out = {}
  if (!isRecord(raw)) return out
  for (const key of Object.keys(raw)) {
    if (known.indexOf(key) < 0) out[key] = raw[key]
  }
  return out
}

/** Records written before `schemaVersion` existed are v1. */
export function schemaVersionOf(raw) {
  const version = Number(isRecord(raw) ? raw.schemaVersion : undefined)
  return Number.isInteger(version) && version > 0 ? version : 1
}

export function emptyDefaults() {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    preset: INIT_PRESET,
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
    model: null,
    skills: { deny: [] },
  }
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

function normalizeModel(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const provider = typeof raw.provider === 'string' ? raw.provider.trim() : ''
  const model = typeof raw.model === 'string' ? raw.model.trim() : ''
  if (!provider || !model) return null
  const effort = typeof raw.reasoningEffort === 'string' ? raw.reasoningEffort.trim() : ''
  return effort ? { provider, model, reasoningEffort: effort } : { provider, model }
}

export function normalizeDefaults(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const servers = value.servers && typeof value.servers === 'object' ? value.servers : {}
  const skills = value.skills && typeof value.skills === 'object' ? value.skills : {}
  const preset = AGENT_PRESET_IDS.includes(value.preset) ? value.preset : INIT_PRESET
  const mcp = MCP_IDS.includes(value.mcp) ? value.mcp : 'init-defaults'
  const base = {
    ...unknownFields(value, DEFAULTS_KEYS),
    schemaVersion: schemaVersionOf(value),
    preset,
    mcp,
    servers: {
      allow: asStringList(servers.allow),
      deny: asStringList(servers.deny),
    },
    model: normalizeModel(value.model),
    skills: { deny: asStringList(skills.deny) },
  }
  if (value.policy && typeof value.policy === 'object') {
    const policy = clampClawPolicy(normalizePolicy({
      ...value.policy,
      preset: AGENT_PRESET_IDS.includes(value.policy.preset) ? value.policy.preset : preset,
    }, preset))
    return {
      ...base,
      preset: policy.preset,
      mcp: policy.mcp,
      servers: policy.servers,
      policy: { ...unknownFields(value.policy, POLICY_KEYS), ...policy },
    }
  }
  return { ...base, policy: clampClawPolicy(normalizePolicy({ preset, mcp, servers: base.servers }, preset)) }
}

export function loadDefaultsSync(file) {
  try {
    return normalizeDefaults(JSON.parse(readFileSync(file, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyDefaults()
    return emptyDefaults()
  }
}

export async function loadDefaults(file) {
  try {
    return normalizeDefaults(JSON.parse(await readFile(file, 'utf8')))
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyDefaults()
    return emptyDefaults()
  }
}

async function atomicWrite(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + '.' + process.pid + '.' + randomUUID() + '.tmp'
  try {
    await writeFile(tmp, text)
    await rename(tmp, path)
  } catch (error) {
    await unlink(tmp).catch(() => {})
    throw error
  }
}

async function readStoredDefaults(file) {
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'))
    return isRecord(raw) ? raw : null
  } catch {
    return null
  }
}

/**
 * Normal user save: writes the current schemaVersion and keeps unknown
 * top-level fields from the stored record. Refuses to downgrade a record
 * written by a newer schema.
 */
export async function saveDefaults(file, value) {
  const stored = await readStoredDefaults(file)
  const storedVersion = stored ? schemaVersionOf(stored) : POLICY_SCHEMA_VERSION
  const incomingVersion = isRecord(value) ? schemaVersionOf(value) : POLICY_SCHEMA_VERSION
  const newest = Math.max(storedVersion, incomingVersion)
  if (newest > POLICY_SCHEMA_VERSION) {
    throw httpError(
      409,
      'policy defaults schemaVersion ' + newest + ' is newer than supported ' + POLICY_SCHEMA_VERSION,
      'POLICY_SCHEMA_UNSUPPORTED',
    )
  }
  const next = {
    ...normalizeDefaults({ ...unknownFields(stored, DEFAULTS_KEYS), ...(isRecord(value) ? value : {}) }),
    schemaVersion: POLICY_SCHEMA_VERSION,
  }
  await atomicWrite(file, JSON.stringify(next, null, 2) + '\n')
  return next
}

export function mcpVisible(defaults, serverName) {
  return mcpServerAllowed(normalizeDefaults(defaults), serverName)
}

export function seedPolicyFromDefaults(defaults, preset) {
  const row = normalizeDefaults(defaults)
  return row.policy || { preset: preset || row.preset, mcp: row.mcp, servers: row.servers }
}

export function readTemplateSeedsSync(home) {
  const dir = seedsDir(home)
  const out = {}
  for (let i = 0; i < TEMPLATE_SEED_FILES.length; i++) {
    const name = TEMPLATE_SEED_FILES[i]
    try { out[name] = readFileSync(join(dir, name), 'utf8') } catch { /* stock */ }
  }
  return out
}

export async function writeTemplateSeed(home, name, content) {
  if (TEMPLATE_SEED_FILES.indexOf(name) < 0) return false
  await atomicWrite(join(seedsDir(home), name), String(content == null ? '' : content))
  return true
}
