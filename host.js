import { defaultsFile, defaultDshHome, loadDefaults, normalizeDefaults, saveDefaults } from './policy-store.mjs'
import { POLICY_SCHEMA_VERSION } from './policy-schema.mjs'
import { registerJsonRoute } from 'dsh-claw-core/http'

export const name = 'dsh-claw-policy'
export const inject = ['connection']

let dshHome = defaultDshHome()

const _internal = {
  setDshHome(dir) { dshHome = dir },
  getDshHome() { return dshHome },
}
export { _internal }

export function apply(ctx) {
  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/policy/defaults',
    handle: async () => {
      const defaults = await loadDefaults(defaultsFile(dshHome))
      return { schemaVersion: POLICY_SCHEMA_VERSION, defaults }
    },
  })
  registerJsonRoute(ctx, {
    path: '/api/dsh-claw/policy/defaults/write',
    handle: async (body) => {
      const defaults = await saveDefaults(
        defaultsFile(dshHome),
        normalizeDefaults(body && body.defaults ? body.defaults : body),
      )
      return { schemaVersion: POLICY_SCHEMA_VERSION, defaults }
    },
  })
}
