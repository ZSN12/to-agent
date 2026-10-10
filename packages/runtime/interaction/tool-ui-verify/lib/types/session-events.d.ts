/** Narrow lifecycle-only audit vocabulary for the UI verification boundary. */
declare module '@taskweaver/dsh-session/types' {
    interface SessionEventMap {
        'ui-verify/lifecycle': {
            action: 'launch' | 'close';
            root: string;
            artifactsDir: string;
        };
    }
}
export type {};
//# sourceMappingURL=session-events.d.ts.map