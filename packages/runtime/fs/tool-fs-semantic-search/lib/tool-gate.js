/** Keeps optional tools and prompt guidance in sync with the active provider's credential. */
export function createSemanticToolGate(options) {
    let mountedProvider = null;
    let disposers = [];
    let generation = 0;
    let disposed = false;
    const unmount = () => {
        const wasMounted = mountedProvider !== null || disposers.length > 0;
        for (const dispose of disposers.splice(0).reverse())
            dispose();
        mountedProvider = null;
        if (wasMounted)
            options.onReset?.();
    };
    return {
        async synchronize() {
            const request = ++generation;
            const provider = options.getProvider();
            const configured = await options.hasCredential(provider);
            if (disposed || request !== generation)
                return;
            if (mountedProvider === provider && configured)
                return;
            unmount();
            if (!configured)
                return;
            disposers = options.mount(provider);
            mountedProvider = provider;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            generation += 1;
            unmount();
        },
    };
}
//# sourceMappingURL=tool-gate.js.map