/**
 * 故障路由自动熔断器 (Route Circuit Breaker)
 * 用于在多 Agent DAG 调度中对发生连续网络或上游传输故障的 failure domain 进行自动熔断与半开试探恢复。
 */

export const CircuitState = Object.freeze({
  CLOSED: 'CLOSED',       // 正常：允许请求通过
  OPEN: 'OPEN',           // 熔断中：直接跳过该 domain
  HALF_OPEN: 'HALF_OPEN', // 半开试探：允许受控的单次试探请求通过
})

export class RouteCircuitBreaker {
  /**
   * @param {object} [options]
   * @param {number} [options.failureThreshold=3] 滑动窗口内触发熔断的失败次数阈值
   * @param {number} [options.windowMs=30000] 统计失败次数的滑动窗口大小 (毫秒)
   * @param {number} [options.cooldownMs=45000] 熔断后的冷却时间 (毫秒)，之后进入 HALF_OPEN
   * @param {number} [options.halfOpenMaxTrials=1] 半开状态允许的最大并发试探请求数
   * @param {() => number} [options.now] 自定义时间获取函数 (便于单测注入)
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 3
    this.windowMs = options.windowMs ?? 30_000
    this.cooldownMs = options.cooldownMs ?? 45_000
    this.halfOpenMaxTrials = options.halfOpenMaxTrials ?? 1
    this.trialTimeoutMs = options.trialTimeoutMs ?? 60_000
    this.getTime = typeof options.now === 'function' ? options.now : () => Date.now()
    this.nextTrialId = 1

    // domain -> domainEntry
    this.domains = new Map()
  }

  /**
   * 获取或初始化指定 domain 的熔断状态条目
   * @private
   */
  _getEntry(domain) {
    if (!domain || typeof domain !== 'string') return null
    let entry = this.domains.get(domain)
    if (!entry) {
      entry = {
        domain,
        state: CircuitState.CLOSED,
        failures: [], // Array<{ timestamp: number, error: string|null, code: string|null }>
        lastStateChange: this.getTime(),
        consecutiveFailures: 0,
        halfOpenTrials: 0,
        halfOpenReservations: new Map(), // token -> createdAt
        lastSuccess: 0,
        lastFailure: null,
      }
      this.domains.set(domain, entry)
    }
    return entry
  }

  /**
   * 清理 entry 中超出滑动窗口的旧失败记录
   * @private
   */
  _pruneOldFailures(entry, now) {
    const cutoff = now - this.windowMs
    entry.failures = entry.failures.filter((record) => record.timestamp >= cutoff)
  }

  /**
   * 获取指定 domain 当前的状态，并在冷却超时时自动跃迁到 HALF_OPEN，同时超时回收试探名额防止永久死锁
   * @param {string} domain
   * @returns {string} CircuitState.CLOSED | CircuitState.OPEN | CircuitState.HALF_OPEN
   */
  getState(domain) {
    const entry = this._getEntry(domain)
    if (!entry) return CircuitState.CLOSED

    const now = this.getTime()
    if (entry.state === CircuitState.OPEN) {
      // 检查是否已过冷却时间
      if (now - entry.lastStateChange >= this.cooldownMs) {
        entry.state = CircuitState.HALF_OPEN
        entry.lastStateChange = now
        entry.halfOpenTrials = 0
        entry.halfOpenReservations.clear()
      }
    } else if (entry.state === CircuitState.HALF_OPEN) {
      // 清理超时的半开试探租约（防止因试探未正常结算而导致 HALF_OPEN 永久死锁）
      if (entry.halfOpenReservations instanceof Map) {
        for (const [token, createdAt] of entry.halfOpenReservations.entries()) {
          if (now - createdAt >= this.trialTimeoutMs) {
            entry.halfOpenReservations.delete(token)
          }
        }
        entry.halfOpenTrials = entry.halfOpenReservations.size
      }
      // 如果处于 HALF_OPEN 且超过冷却超时仍未被成功/失败闭环，强制重置试探名额
      if (now - entry.lastStateChange >= Math.max(this.cooldownMs, this.trialTimeoutMs)) {
        entry.lastStateChange = now
        entry.halfOpenTrials = 0
        entry.halfOpenReservations.clear()
      }
    }
    return entry.state
  }

  /**
   * 检查并预留指定 domain 的一次请求名额。
   * - CLOSED: 总是可用
   * - OPEN: 冷却未过则不可用；冷却结束后跃迁为 HALF_OPEN 并允许单次试探
   * - HALF_OPEN: 仅允许不超过 halfOpenMaxTrials 的试探请求
   *
   * @param {string} domain
   * @returns {boolean}
   */
  isAvailable(domain) {
    return this.tryAcquireTrial(domain)
  }

  /**
   * 检查路由是否可进入，但不占用 HALF_OPEN 试探名额。
   * 用于候选枚举和路由筛选；只有最终选中的路由才应调用 tryAcquireTrial。
   *
   * @param {string} domain
   * @returns {boolean}
   */
  canAttempt(domain) {
    if (!domain || typeof domain !== 'string') return true
    const entry = this._getEntry(domain)
    if (!entry) return true

    const state = this.getState(domain)

    if (state === CircuitState.CLOSED) {
      return true
    }

    if (state === CircuitState.HALF_OPEN) {
      return entry.halfOpenTrials < this.halfOpenMaxTrials
    }

    // state === CircuitState.OPEN
    return false
  }

  /**
   * 原子地为实际选中的 HALF_OPEN 路由预留一次试探。
   * CLOSED 路由不占用试探名额；OPEN 或名额耗尽的 HALF_OPEN 路由拒绝。
   *
   * @param {string} domain
   * @returns {boolean}
   */
  tryAcquireTrial(domain) {
    if (!domain || typeof domain !== 'string') return true
    const state = this.getState(domain)
    if (state === CircuitState.CLOSED) return true
    return typeof this.acquireTrial(domain) === 'string'
  }

  /**
   * Reserve a HALF_OPEN probe and return its unique lease token.
   *
   * @param {string} domain
   * @returns {string | false | null} Token when reserved, false when unavailable, null when not half-open
   */
  acquireTrial(domain) {
    if (!domain || typeof domain !== 'string') return null
    const entry = this._getEntry(domain)
    if (!entry) return null

    const state = this.getState(domain)
    if (state !== CircuitState.HALF_OPEN) return false
    if (entry.halfOpenTrials >= this.halfOpenMaxTrials) return false

    const token = String(this.nextTrialId++)
    const now = this.getTime()
    if (entry.halfOpenReservations instanceof Map) {
      entry.halfOpenReservations.set(token, now)
    } else {
      entry.halfOpenReservations.add(token)
    }
    entry.halfOpenTrials = entry.halfOpenReservations.size
    return token
  }

  /** Release a probe lease that completed without recording a route outcome. */
  releaseTrial(domain, token) {
    if (!domain || typeof domain !== 'string' || typeof token !== 'string') return false
    const entry = this.domains.get(domain)
    if (!entry) return false
    const deleted = entry.halfOpenReservations.delete(token)
    if (!deleted) return false
    entry.halfOpenTrials = entry.halfOpenReservations.size
    return true
  }

  /**
   * 记录某次请求成功
   * 当处于 HALF_OPEN 或 CLOSED 时，重置失败状态为 CLOSED
   *
   * @param {string} domain
   */
  recordSuccess(domain) {
    if (!domain || typeof domain !== 'string') return
    const entry = this._getEntry(domain)
    if (!entry) return

    const now = this.getTime()
    entry.state = CircuitState.CLOSED
    entry.failures = []
    entry.consecutiveFailures = 0
    entry.halfOpenTrials = 0
    entry.halfOpenReservations.clear()
    entry.lastSuccess = now
    entry.lastStateChange = now
  }

  /**
   * 记录某次请求失败
   * - 若处于 HALF_OPEN，试探失败立即重新触发 OPEN 熔断并重新进入冷却期
   * - 若处于 CLOSED，在滑动窗口内连续/累计失败达到 failureThreshold 时触发 OPEN 熔断
   *
   * @param {string} domain
   * @param {any} [error]
   */
  recordFailure(domain, error = null) {
    if (!domain || typeof domain !== 'string') return
    const entry = this._getEntry(domain)
    if (!entry) return

    const now = this.getTime()
    const failureRecord = {
      timestamp: now,
      error: error instanceof Error ? error.message : (error ? String(error) : null),
      code: error?.code ?? null,
    }
    entry.lastFailure = failureRecord

    const currentState = this.getState(domain)

    if (currentState === CircuitState.HALF_OPEN) {
      // 半开试探失败，立即重新熔断
      entry.state = CircuitState.OPEN
      entry.lastStateChange = now
      entry.halfOpenTrials = 0
      entry.halfOpenReservations.clear()
      entry.consecutiveFailures += 1
      entry.failures.push(failureRecord)
      return
    }

    if (currentState === CircuitState.CLOSED) {
      this._pruneOldFailures(entry, now)
      entry.failures.push(failureRecord)
      entry.consecutiveFailures += 1

      if (entry.failures.length >= this.failureThreshold) {
        // 触发熔断
        entry.state = CircuitState.OPEN
        entry.lastStateChange = now
        entry.halfOpenTrials = 0
        entry.halfOpenReservations.clear()
      }
    }
  }

  /**
   * 获取当前所有处于活跃 OPEN 熔断状态的 domains 详细信息
   * @returns {Array<{ domain: string, state: string, openedAt: number, cooldownMs: number, remainingCooldownMs: number, failureCount: number, lastFailure: any }>}
   */
  getActiveBreaks() {
    const now = this.getTime()
    const active = []

    for (const [domain, entry] of this.domains.entries()) {
      const state = this.getState(domain)
      if (state === CircuitState.OPEN) {
        const remainingCooldownMs = Math.max(0, this.cooldownMs - (now - entry.lastStateChange))
        active.push({
          domain,
          state: CircuitState.OPEN,
          openedAt: entry.lastStateChange,
          cooldownMs: this.cooldownMs,
          remainingCooldownMs,
          failureCount: entry.failures.length,
          lastFailure: entry.lastFailure,
        })
      }
    }

    return active
  }

  /**
   * 重置指定 domain
   */
  reset(domain) {
    if (!domain) return
    this.domains.delete(domain)
  }

  /**
   * 重置所有 domain
   */
  resetAll() {
    this.domains.clear()
  }
}

/**
 * 默认全局熔断器单例
 */
export const defaultRouteCircuitBreaker = new RouteCircuitBreaker()
