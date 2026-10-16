export interface SemanticToolGateOptions<Provider extends string> {
    getProvider(): Provider;
    hasCredential(provider: Provider): Promise<boolean>;
    mount(provider: Provider): Array<() => void>;
    onReset?(): void;
}
/** Keeps optional tools and prompt guidance in sync with the active provider's credential. */
export declare function createSemanticToolGate<Provider extends string>(options: SemanticToolGateOptions<Provider>): {
    synchronize(): Promise<void>;
    dispose(): void;
};
//# sourceMappingURL=tool-gate.d.ts.map