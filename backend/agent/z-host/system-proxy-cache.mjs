/** Cache system proxy discovery and coalesce concurrent Host starts. */
export function createSystemProxyConfigCache({
  read,
  now = Date.now,
  ttlMs = 30_000,
}) {
  if (typeof read !== 'function') throw new TypeError('system proxy cache requires a read function')
  let cached = null
  let pending = null

  async function get() {
    if (cached && cached.expiresAt > now()) return cached.value
    if (pending) return pending
    const request = Promise.resolve().then(read).catch(() => null).then((value) => {
      cached = { value, expiresAt: now() + ttlMs }
      return value
    }).finally(() => {
      if (pending === request) pending = null
    })
    pending = request
    return request
  }

  get.invalidate = () => { cached = null }
  return get
}
