export type RunningConversationReconciliation = {
  localIds: ReadonlySet<string>
  backendIds: ReadonlySet<string>
  eventVersionsAtRequest: ReadonlyMap<string, number>
  currentEventVersions: ReadonlyMap<string, number>
  inFlightSendIds: ReadonlySet<string>
  uncertainSendAfterSync: ReadonlyMap<string, number>
  syncVersion: number
}

/**
 * Merge a backend running snapshot without allowing an older snapshot to undo
 * a stream event observed after that snapshot started. In-flight requests stay
 * optimistic until the request itself resolves; uncertain requests wait for a
 * later successful snapshot before being cleared.
 */
export function reconcileRunningConversationIds(input: RunningConversationReconciliation): Set<string> {
  const next = new Set(input.backendIds)
  const candidates = new Set([
    ...input.localIds,
    ...input.backendIds,
    ...input.inFlightSendIds,
    ...input.uncertainSendAfterSync.keys(),
  ])

  for (const conversationId of candidates) {
    const eventChanged = (input.currentEventVersions.get(conversationId) ?? 0)
      !== (input.eventVersionsAtRequest.get(conversationId) ?? 0)
    const sendPending = input.inFlightSendIds.has(conversationId)
    const sendStillUncertain = input.uncertainSendAfterSync.has(conversationId)
      && input.syncVersion <= (input.uncertainSendAfterSync.get(conversationId) ?? -1)

    if (eventChanged || sendPending || sendStillUncertain) {
      if (input.localIds.has(conversationId)) next.add(conversationId)
      else next.delete(conversationId)
    }
  }

  return next
}

export function bridgeFailureMessage(action: string, error: unknown): string {
  const detail = error instanceof Error
    ? error.message.trim()
    : typeof error === 'string'
      ? error.trim()
      : ''
  return `${action}请求状态未能确认${detail ? `：${detail}` : ''}。正在等待连接恢复；恢复后会同步运行状态，请先检查对话再决定是否重试。`
}

export function shouldAutoRestoreFailedDraft(
  result: 'rejected' | 'uncertain',
  sameDraftTarget: boolean,
  untouchedSinceSubmit: boolean,
): boolean {
  return result === 'rejected' && sameDraftTarget && untouchedSinceSubmit
}

export function isSameComposerDraftTarget(
  currentDraftKey: string | null | undefined,
  currentConversationId: string | null | undefined,
  submittedDraftKey: string | null | undefined,
  submittedConversationId: string | null,
): boolean {
  return currentDraftKey === submittedDraftKey && currentConversationId === submittedConversationId
}

/** A submission lock belongs to one draft revision, not the whole conversation. */
export function composerSubmissionKey(draftKey: string, draftRevision: number): string {
  return `${draftKey}:revision:${draftRevision}`
}

export interface UncertainSendEntry {
  generation: number
  transcriptConfirmed: boolean
  syncVersion: number
}

/**
 * 集中管理异常状态下未决发送（Uncertain Send）的生命周期与门禁状态：
 * 保证 generation、transcriptConfirmed 和 syncVersion 原子联动更新，
 * 杜绝多个分散的 useRef 产生不一致与竞态遗漏。
 */
export class UncertainSendTracker {
  private records = new Map<string, UncertainSendEntry>()
  private nextGeneration = 0

  markUncertain(conversationId: string, currentSyncVersion: number): number {
    const generation = ++this.nextGeneration
    this.records.set(conversationId, {
      generation,
      transcriptConfirmed: false,
      syncVersion: currentSyncVersion,
    })
    return generation
  }

  confirmTranscript(conversationId: string, expectedGeneration?: number, currentSyncVersion?: number): void {
    const existing = this.records.get(conversationId)
    if (!existing) return
    if (expectedGeneration !== undefined && existing.generation !== expectedGeneration) return

    existing.transcriptConfirmed = true
    if (currentSyncVersion !== undefined) {
      existing.syncVersion = currentSyncVersion
    }
  }

  clear(conversationId: string): void {
    this.records.delete(conversationId)
  }

  has(conversationId: string): boolean {
    return this.records.has(conversationId)
  }

  get(conversationId: string): UncertainSendEntry | undefined {
    return this.records.get(conversationId)
  }

  isTranscriptConfirmed(conversationId: string): boolean {
    return this.records.get(conversationId)?.transcriptConfirmed ?? false
  }

  getSyncVersion(conversationId: string): number | undefined {
    return this.records.get(conversationId)?.syncVersion
  }

  getGeneration(conversationId: string): number | undefined {
    return this.records.get(conversationId)?.generation
  }

  toSyncVersionMap(): Map<string, number> {
    const map = new Map<string, number>()
    for (const [id, entry] of this.records) {
      map.set(id, entry.syncVersion)
    }
    return map
  }

  keys(): IterableIterator<string> {
    return this.records.keys()
  }

  entries(): IterableIterator<[string, UncertainSendEntry]> {
    return this.records.entries()
  }
}
