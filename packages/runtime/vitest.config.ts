import { spawnSync } from 'node:child_process'
import tsconfigPaths from 'vite-tsconfig-paths'
import { resolvePwshPath } from './shell/pwsh-local/src/resolve.ts'
import { defineConfig } from 'vitest/config'
import { standardDecoratorPlugin, vitestExecArgv } from './vitest.shared.ts'

// Resolution facade shared by every plugin instance below: tsconfig.base.json
// has no include, which vite-tsconfig-paths treats as match-all, so its paths
// map applies to every test file. paths must win over package exports so built
// lib/ never loads a second module-singleton copy.
const pathsPlugin = (): ReturnType<typeof tsconfigPaths> => tsconfigPaths({
  projects: ['./tsconfig.base.json'],
  // Generated JS remains beside some migrated TS source files. It can enter
  // the Vitest graph when a package alias resolves to a directory, so apply
  // workspace path aliases from those JS modules too; otherwise they fall
  // through package exports and load a second copy of shared error classes.
  loose: true,
})

const windowsUnsupportedPackages = process.platform === 'win32'
  ? [
      // Bash-requiring suites (a real POSIX shell is unavailable on Windows).
      // The pwsh-requiring suites (pwsh-local, tool-pwsh) deliberately stay
      // INCLUDED: PowerShell ships with Windows, so they run natively here.
      // This explicit list (not a 'shell/*' glob) keeps
      // shell/shell — the Service Definition package — running on Windows.
      'shell/bash-local',
      'shell/bash-sandbox',
      'shell/tool-bash',
      'sandbox/sandbox-local',
    ]
  : []

const windowsUnsupportedTests = process.platform === 'win32'
  ? [
      ...windowsUnsupportedPackages.map(path => `${path}/tests/**/*.spec.ts`),
      'subprocess/subprocess/tests/**/*.spec.ts',
      'subprocess/subprocess-local/tests/local.spec.ts',
      'subprocess/subprocess-local/tests/process-inspector.spec.ts',
      'subprocess/subprocess-local/tests/spawn.spec.ts',
      'subprocess/subprocess-local/tests/terminal.spec.ts',
    ]
  : []

const windowsUnsupportedCoveragePackages = process.platform === 'win32'
  ? [...windowsUnsupportedPackages, 'subprocess/*']
  : []

// Windows-only packages: their sources execute exclusively on win32 (koffi
// loads Win32 libraries), so the Linux coverage lane can never cover them.
// The Windows dev/CI lane exercises them through the probe/runner suites; the
// per-file 100% gate must not fail on their Linux-uncovered paths.
const windowsOnlyCoverageExclusions = process.platform !== 'win32'
  ? [
      'sandbox/sandbox-windows-acl/src/**/*.ts',
      // The koffi-backed Win32 table (Toolhelp32/GetProcessTimes/taskkill)
      // executes only on win32; its decision logic is unit-pinned on every
      // host through the injected-internals suites.
      'subprocess/subprocess-local/src/windows-inspector.ts',
    ]
  : []

// The confinement runner entry executes exclusively as a spawned child
// process (the sandbox seam's argv-prefix wrapper): its module-level main()
// would run the confinement in-process if imported, and vitest's v8 coverage
// never measures child processes. Its behavior is pinned end-to-end by
// tests/runner.spec.ts, which spawns the real entry through tsx.
const windowsRunnerCoverageExclusions = process.platform === 'win32'
  ? ['sandbox/sandbox-windows-acl/src/runner.ts']
  : []

// pwsh-local's run/start/lifecycle suites self-skip without a real pwsh
// (executor.spec.ts hasPwsh), leaving this file
// far below per-file 100% on pwsh-less hosts; the exemption keeps those hosts
// green while CI runners ship pwsh and still enforce the full bar. The probe
// runs the suites' own resolution (the dependency-free resolve.ts module),
// so the exemption is active exactly when the suites skip — a mismatched
// narrower probe could exempt the file on hosts whose suites actually run.
const pwshCoverageExclusions = spawnSync(resolvePwshPath(), ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$true'], { encoding: 'utf8' }).status === 0
  ? []
  : [
      'shell/pwsh-local/src/index.ts',
      'shell/pwsh-sandbox/src/**/*.ts',
    ]

const testIncludes = [
  '*/*/tests/**/*.spec.{ts,tsx}',
  'apps/*/tests/**/*.spec.ts',
  'examples/*/tests/**/*.spec.ts',
  'host-cli/tests/**/*.spec.ts',
  'scripts/**/*.spec.ts',
]

// This retained package used to run through its own Vitest config so its
// document parsers could use longer worker and hook timeouts. Keep that
// package-specific budget in the workspace config instead of dropping its
// suite from the aggregate run.
const extendedTimeoutTests = ['fs/tool-document/tests/**/*.spec.ts']

// These suites exercise process-global state, process APIs, or timing-sensitive process I/O
// that worker threads cannot isolate reliably under aggregate gate contention.
// Keep the narrow exception in forks while the rest of the inventory avoids per-file processes.
const processBoundTests = [
  'session/session-persistence-jsonl/tests/jsonl.spec.ts',
  'subprocess/subprocess-local/tests/process-exit.spec.ts',
  'subprocess/subprocess-local/tests/spawn.spec.ts',
  'llm/llm-pi-ai/tests/adapter.spec.ts',
  'boot/app-boot/tests/app-boot.spec.ts',
  'workflow/workflow-worker-thread/tests/session.spec.ts',
]

export default defineConfig({
  plugins: [pathsPlugin(), standardDecoratorPlugin()],
  resolve: {
    // The migrated runtime still carries generated JS beside some TS source
    // files. Package aliases point at source directories, so prefer authored
    // TS entry points when resolving an extensionless package root.
    extensions: ['.mjs', '.mts', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.cts', '.json'],
  },
  test: {
    // .tsx: client component specs are included alongside Node specs.
    include: testIncludes,
    exclude: windowsUnsupportedTests,
    // One coverage invocation aggregates both projects. Every suite forks for
    // Node stability; process-bound suites stay separate for inventory control.
    projects: [
      {
        plugins: [pathsPlugin(), standardDecoratorPlugin()],
        test: {
          name: 'thread-safe',
          execArgv: vitestExecArgv,
          // Node 24 has aborted in its CJS lexer (v8::ToLocalChecked Empty
          // MaybeLocal in cjs_lexer::Parse) from worker threads on macOS,
          // Linux, and Windows. Forked workers avoid that shared thread path.
          pool: 'forks',
          include: testIncludes,
          exclude: [
            ...windowsUnsupportedTests,
            ...processBoundTests,
            ...extendedTimeoutTests,
          ],
        },
      },
      {
        plugins: [pathsPlugin(), standardDecoratorPlugin()],
        test: {
          name: 'process-bound',
          execArgv: vitestExecArgv,
          pool: 'forks',
          include: processBoundTests,
          exclude: windowsUnsupportedTests,
        },
      },
      {
        plugins: [pathsPlugin(), standardDecoratorPlugin()],
        test: {
          name: 'extended-timeout',
          execArgv: vitestExecArgv,
          pool: 'forks',
          include: extendedTimeoutTests,
          testTimeout: 40_000,
          hookTimeout: 40_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      // Coverage measures OUR runtime source. Types-only files carry no
      // executable code; vendor/ and examples/ are out of scope (examples are
      // exercised by the demo smoke test instead).
      // .tsx: client components are gated like every other included source file.
      include: ['*/*/src/**/*.{ts,tsx}'],
      // Types-only files have no runtime coverage. Importing self-executing bins/workers would boot
      // them inside the unit process, so real subprocess/Worker tests cover their thin entry glue.
      exclude: [
        '*/*/src/types.ts',
        '*/*/src/bin.ts',
        '*/*/src/worker.ts',
        // A killed executable lint-contract test can leave a non-product source probe behind.
        '*/*/src/oxlint-contract-*.ts',
        // Client runtime's non-settings service files retain focused unit coverage debt.
        'client/runtime/src/**/!(settings-scope).ts',
        'host/webserver/src/*',
        'client/connection/src/index.ts',
        'client/connection/src/http-bridge.ts',
        // This assembly imports generated Host-for-Client code that exists
        // only in lib; the post-build built-bin smoke executes both entries.
        'api/remotes/src/index.ts',
        'api/remotes/src/client/index.ts',
        'client/connection/src/client/fixture.ts',
        'extensions/*/src/**/*.ts',
        'extensions/*/src/**/*.tsx',
        // Typert generator: correctness is pinned by its fixture suites and
        // the byte-for-byte catalog reproduction test; per-file coverage
        // would put whole-workspace compiler analysis under v8
        // instrumentation — the coverage lane's longest tail.
        'typert/generator/src/*.ts',
        'host/apiproxy/src/index.ts',
        'host/apiproxy/src/invariant.ts',
        'host/apiproxy/src/api-proxy.ts',
        // Projection/command round: executor lifecycle branches and the
        // registry's drive tails need the same maturing lanes. TODO(gui):
        // cover and remove with the client test lane above.
        'interaction/commands/src/index.ts',
        'interaction/commands/src/invariant.ts',
        'session/session-projection/src/index.ts',
        ...windowsUnsupportedCoveragePackages.map(path => `${path}/src/**/*.ts`),
        ...windowsOnlyCoverageExclusions,
        ...windowsRunnerCoverageExclusions,
        ...pwshCoverageExclusions,
      ],
      // 100% or it doesn't merge (docs/testing.md: excessive tests are welcome).
      // Per-file so a well-covered big file can't subsidize a bare one.
      // Every v8 ignore comment must carry a reason — see the quality-gates Agent Note
      // (.agents/notes/implemented/process/2026-06-11-quality-gates.md).
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
      reporter: process.env.CI ? ['text'] : ['text', 'html'],
    },
  },
})
