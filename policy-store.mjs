import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { MCP_IDS, POLICY_SCHEMA_VERSION, mcpServerAllowed } from './policy-schema.mjs'

export function defaultDshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

export function defaultsFile(home) {
  return join(home || defaultDshHome(), 'agent-policy', 'defaults.json')
}

export function emptyDefaults() {
  return {
    version: POLICY_SCHEMA_VERSION,
    mcp: 'init-defaults',
    servers: { allow: [], deny: [] },
  }
}

function asStringList(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
}

export function normalizeDefaults(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const servers = value.servers && typeof value.servers === 'object' ? value.servers : {}
  const version = Number(value.version)
  return {
    version: Number.isFinite(version) && version > 0 ? Math.floor(version) : POLICY_SCHEMA_VERSION,
    mcp: MCP_IDS.includes(value.mcp) ? value.mcp : 'init-defaults',
    servers: {
      allow: asStringList(servers.allow),
      deny: asStringList(servers.deny),
    },
  }
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

export async function saveDefaults(file, value) {
  const next = normalizeDefaults(value)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, JSON.stringify(next, null, 2) + '\n')
  return next
}

export function mcpVisible(defaults, serverName) {
  return mcpServerAllowed(normalizeDefaults(defaults), serverName)
}

export function seedPolicyFromDefaults(defaults, preset) {
  const row = normalizeDefaults(defaults)
  return { preset, mcp: row.mcp }
}
