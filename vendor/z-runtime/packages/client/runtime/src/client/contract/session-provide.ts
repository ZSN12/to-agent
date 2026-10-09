import type { ObservableSnapshot } from './store.ts'

/** Current session's runtime-provided data bundle, independent of any renderer. */
export interface SessionMaybeProvideInfo {
  /** Current session id, absent when the application has no current session. */
  sessionId: string | undefined
  /** Named observable sources contributed by runtime services. */
  hooks: Record<string, ObservableSnapshot<unknown> | undefined>
  /** Named plain values contributed by runtime services. */
  props: Record<string, unknown>
  /** Optional key-addressed projection source for the current session. */
  projections?: { faceOf(key: string): ObservableSnapshot<unknown> } | undefined
}

/** Definite session bundle; every declared observable source is present. */
export interface SessionProvideInfo extends SessionMaybeProvideInfo {
  sessionId: string
  hooks: Record<string, ObservableSnapshot<unknown>>
}
