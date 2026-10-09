# TaskWeaver OpenCodex fork

This directory is **vendored source**, not fetched from npm on every install.

- **Upstream baseline:** [lidge-jun/opencodex](https://github.com/lidge-jun/opencodex) (published as `@bitkyc08/opencodex@2.79.0`).
- **Package name:** `@taskweaver/opencodex` (wired via `package.json` → `file:vendor/opencodex`).
- **TaskWeaver-specific changes** (verified by `scripts/check-ocx-patch-scope.mjs`):
  - `src/adapters/cursor/protobuf-events.ts` — bare Z Host tool names (`read`, `grep`, `bash`, …) resolve to advertised `ocx_client_*` on the Cursor wire.

When merging upstream releases, diff against 2.79.0+ and re-apply the Cursor adapter changes; run `node scripts/test-opencodex-taskweaver-patch.mjs`.

## Self-update / npm registry

TaskWeaver builds set `package.json` name to `@taskweaver/opencodex`. Logic in `src/lib/taskweaver-distribution.mjs` disables:

- `ocx update` pulling `@bitkyc08/opencodex` from npm
- Interactive “update available” prompts and background version cache refresh against the public registry

Updates ship with TaskWeaver (`git pull && npm install` in the app repo, then `ocx restart`).

License: MIT (see `LICENSE`).
