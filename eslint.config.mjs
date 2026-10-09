import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

const runtimeSource = 'packages/runtime/{apps,packages,scripts}/**/*.{ts,tsx}'

export default [
  {
    ignores: [
      'electron/vendor/**',
      'release/**',
      '**/dist/**',
      'vendor/opencodex/**',
      'vendor/taskweaver-z-runtime/**',
      'packages/runtime/**/lib/**',
      '**/lib/**',
      'packages/runtime/cordis/**',
    ],
    // DSH carries upstream oxlint suppressions. ESLint should consume valid
    // local suppressions without warning on directives for oxlint-only rules.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  },
  {
    files: ['electron/**/*.mjs', 'electron/**/*.cjs', 'scripts/**/*.mjs', 'packages/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'packages/**/*.ts', 'packages/**/*.tsx', runtimeSource],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // TypeScript's noUnusedLocals/noUnusedParameters are enforced by the
      // repository build; Espree's JavaScript-only rules must not inspect TS.
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-unreachable': 'error',
      '@typescript-eslint/no-explicit-any': 'off',
    },
    plugins: { '@typescript-eslint': tsPlugin },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    // Hooks exhaustive-deps was not part of the existing root lint gate. Keep
    // its existing scoped suppressions recognized without widening P5.6's
    // baseline into unrelated renderer changes.
    rules: { 'react-hooks/exhaustive-deps': 'off' },
  },
]
