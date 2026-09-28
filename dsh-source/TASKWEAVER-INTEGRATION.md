# TaskWeaver DSH Runtime Integration

This directory is a local source snapshot used to evaluate and integrate the DeepSeek Harness runtime into TaskWeaver. TaskWeaver keeps its current React interface and product identity; DSH is the candidate backend runtime, not a replacement UI.

## Snapshot provenance

- Upstream: `https://github.com/deepseek-ai/deepseek-harness`
- Git revision in the original local checkout: `c6becee28490136a81befed9a5c06f0c77bae98d` (2026-08-24)
- The snapshot includes the original local checkout's working-tree edits and untracked source files as of 2026-09-28.
- `.git`, `node_modules`, `.dsh-build`, `dist` directories, and TypeScript build caches are intentionally excluded. Existing package-level `lib` artifacts from the local source snapshot are retained. The original checkout at `~/Documents/deepseek/dsh-source` remains untouched.
- Keep the upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` with this source. Dependencies must be installed and packaged from this project; runtime code must not resolve files from the original checkout or another machine-local directory.

## Product boundaries

- Preserve TaskWeaver's existing React/Electron presentation and interaction design.
- Use DSH session events and persistence as the canonical conversation/runtime history instead of maintaining a second independent Agent loop.
- Keep TaskWeaver's product logic above the DSH runtime: user-selected primary conversation model, explicit/skill/complexity-gated multi-agent execution, DAG task model routing, routing portfolio, quota-cycle policy, and TaskWeaver-specific task views.
- DSH-provided capabilities are candidates for the backend: model adapters, tool execution, permissions/sandbox, session persistence/recovery, Skills, MCP/extensions, and terminal services. Integrate only through supported package APIs or deliberate TaskWeaver adapters.

## Integration checkpoint

Do not remove the existing Pi-backed runtime until a packaged Electron build can pass this vertical slice using only files inside the TaskWeaver project:

1. Start the runtime from the packaged app without an external checkout or development server.
2. Configure an API-backed model and send a message through the existing TaskWeaver UI, including streamed text and tool calls.
3. Exercise read-only, workspace-write, and approval-required operations through DSH permission and sandbox services.
4. Switch between two conversations while both have work in flight; verify separate timers, context usage, transcript, and cancellation.
5. Restart the app and recover each conversation's durable history and interrupted-turn state.
6. Run a multi-agent DAG with the chosen primary model for planning/synthesis and portfolio routing only for child tasks.
7. Verify the production package contains the required DSH runtime closure and license notices, with no dependency on paths outside this project.
