/**
 * The desktop approver: resolve a policy verdict into a go/no-go by consulting
 * the `approval/request` waterfall for anything not already allowed, with an
 * in-process persistent-approval cache per bundle id. Enforcement stays with
 * the approval service — the approver only asks and interprets outcomes.
 * @module @z/dsh-tool-desktop
 */

import type { Agent } from '@z/dsh-agent'
import type { ApprovalOutcome, ApprovalRequest } from '@z/dsh-user-approval'
import type { DesktopAccessPolicy } from './types.ts'
import { classifyDesktopAccess } from './policy.ts'
import './session-events.ts'

/** The `approval/request` dispatcher seam (the approval capability service). */
export interface ApprovalDispatcher {
  request(req: ApprovalRequest): Promise<ApprovalOutcome>
}

/** Options for the desktop approver. */
export interface ApproverOptions {
  /** The active app-level access policy. */
  policy: DesktopAccessPolicy
  /** The approval dispatcher to consult for non-deny verdicts. */
  approval: ApprovalDispatcher
  /**
   * If true, even an `allow` policy verdict is routed through the approval
   * waterfall (belt-and-suspenders). Defaults to false: `allow` runs directly.
   */
  gateAllow?: boolean
  /**
   * If true, an `allowed-once` outcome for a bundle id is cached so later
   * actions on the same app in this process do not re-prompt. Defaults to false.
   */
  persist?: boolean
}

/** A persistent grant cache shared across approver instances in one process. */
export class PersistentGrantCache {
  private readonly granted = new Set<string>()

  /**
   * Record a grant for a bundle id.
   * @param bundleId - the granted macOS bundle id
   */
  grant(bundleId: string): void {
    this.granted.add(bundleId)
  }

  /**
   * Whether a grant is currently held for a bundle id.
   * @param bundleId - the bundle id to query
   * @returns true when a grant is currently held
   */
  has(bundleId: string): boolean {
    return this.granted.has(bundleId)
  }
}

/**
 * Build an approver that decides a desktop action for a target bundle id on
 * behalf of an agent. A `deny` policy verdict is final and never prompts.
 * Anything else consults the approval waterfall; `rejected` denies,
 * `allowed-once` grants (and is cached when `persist`), and any other outcome
 * fails closed to deny.
 * @param options - policy, dispatcher, and gating/persistence options
 * @param cache - shared persistent-grant cache (may be a fresh one)
 * @returns an approver keyed on agent, bundle id, and action
 */
export function createApprover(
  options: ApproverOptions,
  cache: PersistentGrantCache = new PersistentGrantCache(),
): (agent: Agent, bundleId: string | null, action: string) => Promise<{ ok: true } | { ok: false; reason: string }> {
  return async (agent: Agent, bundleId: string | null, action: string) => {
    if (!bundleId) {
      const outcome = await options.approval.request({
        agent,
        toolName: 'desktop_' + action,
        reason: 'No frontmost application to scope desktop access; confirm the action.',
      })
      if (outcome === 'allowed-once') return { ok: true }
      return { ok: false, reason: `desktop: not approved (${outcome})` }
    }
    const verdict = classifyDesktopAccess(options.policy, bundleId)
    if (verdict === 'deny') {
      return { ok: false, reason: `desktop: access denied by policy for ${bundleId}` }
    }
    if (options.persist && cache.has(bundleId)) return { ok: true }
    if (verdict === 'allow' && !options.gateAllow) {
      if (options.persist) cache.grant(bundleId)
      return { ok: true }
    }
    const outcome = await options.approval.request({
      agent,
      toolName: 'desktop_' + action,
      reason: `Desktop action on ${bundleId}`,
    })
    if (outcome === 'allowed-once') {
      if (options.persist) cache.grant(bundleId)
      return { ok: true }
    }
    return { ok: false, reason: `desktop: not approved for ${bundleId} (${outcome})` }
  }
}
