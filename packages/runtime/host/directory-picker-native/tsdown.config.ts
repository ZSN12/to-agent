import { defineConfig } from 'tsdown'

/**
 * Node-only backend. The Win32 dialog worker builds as its own CJS entry
 * (mirroring dsh-workflow-worker-thread's worker): path-loaded by the driver,
 * inlining the dialog logic while koffi stays an external native require.
 */
const nodeBackend = {
  entry: ['lib/types/index.js', 'lib/types/invariant.js'],
  outDir: 'lib',
  format: ['esm'] as const,
  platform: 'node' as const,
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
}

/** Win32 dialog worker is only built on Windows; macOS Host uses the checked-in lib/worker.cjs. */
const win32Worker =
  process.platform === 'win32'
    ? [{
        entry: { worker: 'src/win32-dialog-worker.ts' },
        outDir: 'lib',
        format: ['cjs'] as const,
        platform: 'node' as const,
        target: 'es2024',
        fixedExtension: false,
        dts: false,
        clean: false,
      }]
    : []

export default defineConfig([nodeBackend, ...win32Worker])
