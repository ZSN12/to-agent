# Electron vendor artifacts

## `dsh-chat-registry.mjs`

Bundled Conversation Node definitions from `packages/runtime` (see `scripts/build-dsh-chat-registry.mjs`).

Generate locally:

```bash
npm run build:dsh-chat-registry
```

Requires a working `esbuild` binary (project `node_modules/esbuild` or `npx`). Until this file exists, DSH projection in main runs with an **empty** node registry (UI still gets `running` / queue from Session, but no tool/assistant chat nodes).
