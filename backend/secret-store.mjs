/**
 * Unified secret store based on Platform.secrets (macOS Keychain via Swift).
 * Backend holds plaintext only in memory. JSON files store only 'keychain:<account>' references.
 */

export const KEYCHAIN_REF_PREFIX = 'keychain:'

/**
 * Check if a stored string is a keychain reference.
 * @param {string | undefined | null} value
 * @returns {boolean}
 */
export function isKeychainRef(value) {
  return typeof value === 'string' && value.startsWith(KEYCHAIN_REF_PREFIX)
}

/**
 * Format an account name as a keychain reference.
 * @param {string} accountKey
 * @returns {string}
 */
export function formatKeychainRef(accountKey) {
  return `${KEYCHAIN_REF_PREFIX}${accountKey}`
}

/**
 * Parse an account name from a keychain reference.
 * @param {string} ref
 * @returns {string}
 */
export function parseKeychainRef(ref) {
  if (!isKeychainRef(ref)) return ref
  return ref.slice(KEYCHAIN_REF_PREFIX.length)
}

/**
 * Create a SecretStore manager bound to the current platform.
 * @param {{ platform: import('./platform/index.mjs').Platform }} options
 */
export function createSecretStore({ platform }) {
  const secrets = platform.secrets

  return {
    /**
     * Resolve a raw value or keychain reference to plaintext secret.
     * @param {string | undefined | null} valueOrRef
     * @returns {Promise<string | null>}
     */
    async resolveSecret(valueOrRef) {
      if (!valueOrRef) return null
      if (isKeychainRef(valueOrRef)) {
        const account = parseKeychainRef(valueOrRef)
        return secrets.get(account)
      }
      return String(valueOrRef)
    },

    /**
     * Store a secret and return its keychain reference string.
     * @param {string} account
     * @param {string} secret
     * @returns {Promise<string>} Reference string to persist in JSON configs
     */
    async storeSecret(account, secret) {
      if (!secret) {
        await secrets.delete(account)
        return ''
      }
      await secrets.set(account, String(secret))
      return formatKeychainRef(account)
    },

    /**
     * Delete a secret by account or reference.
     * @param {string} accountOrRef
     * @returns {Promise<void>}
     */
    async deleteSecret(accountOrRef) {
      const account = isKeychainRef(accountOrRef) ? parseKeychainRef(accountOrRef) : accountOrRef
      await secrets.delete(account)
    },

    // --- Provider Model API Keys ('model:<providerId>') ---
    async getModelApiKey(providerId) {
      return secrets.get(`model:${providerId}`)
    },
    async setModelApiKey(providerId, apiKey) {
      const key = `model:${providerId}`
      if (!apiKey) {
        await secrets.delete(key)
        return ''
      }
      await secrets.set(key, String(apiKey))
      return formatKeychainRef(key)
    },
    async deleteModelApiKey(providerId) {
      await secrets.delete(`model:${providerId}`)
    },

    // --- MCP Server Env ('mcp:<serverId>:<VAR>') ---
    async getMcpEnv(serverId, varName) {
      return secrets.get(`mcp:${serverId}:${varName}`)
    },
    async setMcpEnv(serverId, varName, value) {
      const key = `mcp:${serverId}:${varName}`
      if (!value) {
        await secrets.delete(key)
        return ''
      }
      await secrets.set(key, String(value))
      return formatKeychainRef(key)
    },
    async deleteMcpEnv(serverId, varName) {
      await secrets.delete(`mcp:${serverId}:${varName}`)
    },

    // --- Web Search API Key ('websearch:apiKey') ---
    async getWebSearchApiKey() {
      return secrets.get('websearch:apiKey')
    },
    async setWebSearchApiKey(apiKey) {
      const key = 'websearch:apiKey'
      if (!apiKey) {
        await secrets.delete(key)
        return ''
      }
      await secrets.set(key, String(apiKey))
      return formatKeychainRef(key)
    },
  }
}
