/** Narrow lifecycle-only audit vocabulary for the UI verification boundary. */
declare module '@z/dsh-session/types' {
  interface SessionEventMap {
    'ui-verify/lifecycle': {
      action: 'launch' | 'close'
      root: string
      artifactsDir: string
    }
  }
}

export type {}
