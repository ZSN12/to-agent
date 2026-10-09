import globals from 'globals'

export default [
  {
    ignores: ['vendor/**', 'electron/vendor/**', 'release/**', 'dist/**'],
  },
  {
    files: ['electron/**/*.mjs', 'electron/**/*.cjs', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-unreachable': 'error',
    },
  },
]
