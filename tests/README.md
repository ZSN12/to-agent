# Integration Tests

Root-level integration tests use Node.js's built-in `node:test` runner. The repository supports Node.js `>=22.18` and uses pnpm `11.7.0`.

## Test files

```text
tests/
├── helpers/
│   └── mock-services.mjs
├── chat-document-attachments.test.mjs
├── chat-image-attachments.test.mjs
├── conversation-id-routing.test.mjs
├── dsh-reconnect.test.mjs
├── fork-thread-smoke.test.mjs
├── multi-session-parallel.test.mjs
├── permission-flow.test.mjs
└── ui-accessibility-source.test.mjs
```

## Run tests

Run all root-level integration tests:

```bash
pnpm run test:integration
```

Run the suites with dedicated package scripts:

```bash
pnpm run test:integration:multi-session
pnpm run test:integration:reconnect
```

Run a specific test file directly:

```bash
node --test tests/permission-flow.test.mjs
node --test tests/fork-thread-smoke.test.mjs
```

There is no dedicated permissions package script; use the direct `node --test` command above.
