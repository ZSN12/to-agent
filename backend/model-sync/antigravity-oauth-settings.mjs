const KEYCHAIN_ACCOUNT = 'oauth:google-antigravity:client'
const MAX_CREDENTIAL_LENGTH = 8192

function normalizeCredential(value) {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  if (normalized.length > MAX_CREDENTIAL_LENGTH || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error('Google Antigravity OAuth 凭据格式无效。')
  }
  return normalized
}

function decodeStoredCredentials(raw) {
  if (typeof raw !== 'string' || !raw) return null
  try {
    const parsed = JSON.parse(raw)
    const clientId = normalizeCredential(parsed?.clientId)
    const clientSecret = normalizeCredential(parsed?.clientSecret)
    if (clientId && clientSecret) return { clientId, clientSecret }
  } catch {
    // Ignore an unreadable legacy item and allow environment credentials as fallback.
  }
  return null
}

/** Read credentials from Keychain, falling back to explicitly configured environment credentials. */
export async function getAntigravityOAuthCredentials(secrets, env = process.env) {
  const stored = secrets?.get ? decodeStoredCredentials(await secrets.get(KEYCHAIN_ACCOUNT)) : null
  if (stored) return { ...stored, isCustom: true }

  const clientId = normalizeCredential(env.GOOGLE_ANTIGRAVITY_CLIENT_ID)
  const clientSecret = normalizeCredential(env.GOOGLE_ANTIGRAVITY_CLIENT_SECRET)
  if (clientId && clientSecret) return { clientId, clientSecret, isCustom: true }

  return null
}

/** Return presence and mode flags; credentials never cross the renderer boundary. */
export async function getAntigravityOAuthStatus(secrets, env = process.env) {
  const creds = await getAntigravityOAuthCredentials(secrets, env)
  return {
    configured: Boolean(creds),
    isDefault: creds?.isDefault === true,
    hasCustomCredentials: creds?.isCustom === true,
  }
}

/** Persist the OAuth client pair as one Keychain item so updates stay atomic. */
export async function saveAntigravityOAuthCredentials(secrets, input) {
  if (typeof secrets?.set !== 'function') {
    throw new Error('当前桌面环境没有可用的 macOS Keychain。')
  }
  const clientId = normalizeCredential(input?.clientId)
  const clientSecret = normalizeCredential(input?.clientSecret)
  if (!clientId || !clientSecret) {
    throw new Error('请填写 Google Antigravity OAuth Client ID 和 Client Secret。')
  }
  await secrets.set(KEYCHAIN_ACCOUNT, JSON.stringify({ clientId, clientSecret }))
  return { configured: true, isDefault: false, hasCustomCredentials: true }
}

/** Remove custom Keychain item to restore built-in default client. */
export async function resetAntigravityOAuthCredentials(secrets) {
  if (typeof secrets?.delete === 'function') {
    await secrets.delete(KEYCHAIN_ACCOUNT)
  }
  return { configured: false, isDefault: false, hasCustomCredentials: false }
}
