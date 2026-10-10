# TaskWeaver provider bridge

This package owns the Cursor adapter used by TaskWeaver's in-process bridge. It also exposes the
provider OAuth flows that are required by the bridge integration. The Cursor runtime dependency
graph is kept under `src/`; it does not load the OpenCodex CLI, start a child process, or require a
TypeScript runtime loader.

`pnpm --filter @taskweaver/provider-bridge build` emits the Node ESM entry in `lib/`. The app-side
transport imports that built entry. Credential persistence and account selection are still owned
by the existing OAuth service until P3.4 replaces its CLI/Bun boundary.

The Cursor source retains TaskWeaver's protobuf event mapping for its bare Host tool names. The
copied upstream source remains under MIT; see [LICENSE](./LICENSE) and [NOTICE.md](./NOTICE.md).
