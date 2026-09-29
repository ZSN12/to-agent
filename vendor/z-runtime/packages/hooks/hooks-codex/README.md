# @z/dsh-hooks-codex

English | [中文](README.zh.md)

A cordis plugin that runs the supported subset of a user's existing **Codex** hook config on the harness's canonical interception points. The **Codex dialect** half of the hooks subsystem. The dialect-agnostic primitives come from [`@z/dsh-hook-protocol`](../hook-protocol/README.md); this bridge owns the Codex-shaped payloads, matcher mode, and decision mapping.

This bridge implements a deliberate subset of Codex's current hook protocol:

- **Eight of Codex's current eleven hook points:** `PreToolUse`, `PostToolUse`, `SessionStart`, `UserPromptSubmit`, `Stop`, `PermissionRequest`, `SubagentStart`, and `SubagentStop`.
- **Regex-only matchers** (no literal fast path; the matcher is always an unanchored regex).
- **snake_case stdin payloads** with `turn_id`/`model` extras, written **without** a trailing newline.
- **No Codex plugin env injection and no config-time placeholder substitution** (the command still receives the executor's environment and runs through its shell).
- **No pre-tool approval or rewrite path** — a hook can block, but the bridge does not pre-approve or replace tool input.

A native cordis plugin could do everything this bridge does, more powerfully; the bridge exists only as a compatibility path for the mapped Codex subset (see [the interception extension-points Agent Note](../../../.agents/notes/implemented/feature/2026-06-30-interception-extension-points.md)).

## Config

```ts
import type { Config } from '@z/dsh-hooks-codex'
const config: Config = {
  configPath: '/path/to/.codex/hooks.json', // required
  model: 'deepseek-v4',                      // optional: stamped on every payload (Codex includes `model`)
  defaultTimeoutMs: 600_000,                 // optional: per-hook timeout when a hook sets none
  stderrSummaryMaxChars: 500,                // optional: char cap on the hook/result event's persisted stderr summary
  stopLoopGuardMax: 5,                       // optional: cap on consecutive blocking Stop-hook continuations (0 disables)
}
```

In a `cordis.yml`:

```yaml
- dsh-hooks-codex:
    configPath: ./.codex/hooks.json
    model: deepseek-v4
```

The config is parsed **once** at load. `configPath` is **process-level** — a relative path resolves against the process launch cwd at load time, not per-session (`TODO(per-session-hook-config)`). A read/parse failure is contained (logs + registers nothing); an invalid regex matcher on an event that consumes matchers is one such failure and reports its pattern and event. Only sync `type: 'command'` hooks run — a non-command or `async: true` hook is parsed-and-skipped with a warning. A hook accepts `timeout` or the `timeoutSec` alias; one that sets neither runs under the protocol's reference default (`DEFAULT_HOOK_TIMEOUT_MS` from `dsh-hook-protocol`, 10 minutes). Events outside the eight bridge-supported points are dropped at parse.

The hooks themselves run in the agent's session workspace: for the agent-scoped points the bridge passes the session's `cwd` as the hook process's working directory, so a hook operates in the user's project tree, not the server launch dir.

## Hook points → typed Decisions

| Codex hook | Harness point | Mapping |
|---|---|---|
| `SessionStart` | `agent/session-start` (emit) | a plain-stdout hook's output → additionalContext → `agent.inject()` |
| `UserPromptSubmit` | `agent/pre-step` (waterfall) | `block` (exit 2) → `PreStepDecision.reject`; additionalContext-only → delegate via `next()` then append a separately sourced message to a downstream `enter` decision |
| `PreToolUse` | `tools/pre-execute` (waterfall) | `block` → `PreToolDecision.deny` (no `allow`/`ask`) |
| `PostToolUse` | `tools/post-execute` (waterfall) | `block` → `block` with feedback; additionalContext-only → delegate via `next()` then prepend a separately sourced context to the downstream decision; Code Mode defers sub-call contexts until the outer `run_code` result |
| `Stop` | `agent/turn-stopping` (serial) | a blocking Stop hook feeds its reason through `steer()`, forcing another step |
| `PermissionRequest` | `approval/request` (waterfall, prepend) | `permissionDecision: allow` → `allowed-once`; `deny` (block) → `rejected`; silent/`decline` → `next()` (delegate to the composed human/UI answerers) |
| `SubagentStart` | `subagent/start` (emit) | additionalContext → `child.inject()` into a live in-process child; a remote child has no local injection target |
| `SubagentStop` | `subagent/end` (emit) | observe-only (blocking `deny` is not honored — there is no run-level continuation decision) |

A tool call's payload carries the real `tool_name` (the same value the matcher tests) and Codex's `tool_input: { command }` shape (the `command` arg when present, else `''`). The matcher subject is the tool name (`PreToolUse`/`PostToolUse`) or the session source (`SessionStart`); `UserPromptSubmit`/`Stop` ignore matchers.

Every agent-scoped stdin payload carries `session_id` and `transcript_path`. The bridge resolves the latter through `ctx.sessionPersistence.locate(session.header)` when available and otherwise sends `null`, preserving the Codex `string | null` shape. Lookup does not create or flush the artifact, so a path can be absent before the first turn-end checkpoint or omit the current open turn.

`SessionStart` — the one emit point — runs detached; each run chain is tracked, and disposing the bridge aborts a still-running hook process, then drains the continuation before the dispose resolves (`createDetachedRuns` in `dsh-hook-protocol`).

## Context source

Injected context carries an explicit `{ kind: 'plugin', plugin: 'hooks-codex' }` source so the durable message is never mistaken for a user prompt.

## Model Experience

### Hook-provided context

#### What the model sees

`SessionStart`, accepted prompt, and post-tool hooks can add source-attributed context messages; a blocking `Stop` hook adds its reason as next-step steering.

#### Token effect

No cost when hooks return no context. Hook text is data-dependent, logged, and resent until compaction.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Blocked prompt or tool outcome

#### What the model sees

Provider-supplied reasons pass through verbatim. When absent, a blocked prompt uses exactly `blocked by UserPromptSubmit hook`, a denied tool becomes `Error: blocked by PreToolUse hook`, blocked post-tool feedback is exactly `blocked by PostToolUse hook`, and a blocking stop adds steering exactly `continue: blocked by Stop hook`. Codex `systemMessage` is not surfaced.

#### Token effect

Blocking a prompt removes its request tokens; denial or feedback adds the retained fallback or provider text; forced continuation pays another full request.

#### KV Cache effect

A blocked prompt sends no request and invalidates nothing. Denial, feedback, and forced-continuation context append after the reusable prefix without rewriting it.

## Known Limitations and Deferred Work

- **Unsupported hook events (3 of Codex's current 11):** `PreCompact`, `PostCompact`, and the emitted `SessionEnd` (which needs a new session-lifecycle hook). Config for these events is silently dropped during parsing. The comparison baseline is Codex's [official hook reference](https://learn.chatgpt.com/docs/hooks).
- **`PermissionRequest` is partial:** `allow`/`deny` (block) decisions and delegation work, but the payload cannot carry the full tool arguments (the approval request exposes only `toolName`/`reason`, so `tool_input` is an empty shell `{ command }`), `permission_request_type` is fixed at `general`, and `decline` collapses to the same delegate path as a silent hook.
- **`SubagentStart`/`SubagentStop` are partial:** `agent_type` is always the Codex Task-tool default `general-purpose` (the harness subagent seam carries no per-kind label, so a config matching a specific kind does not fire), and a blocking `SubagentStop` is not honored — the bridge observes only.
- **`SessionStart` is partial:** plain stdout and JSON `additionalContext` work, but the hook runs detached, so context can miss the first request (`TODO(session-start-gating)`).
- **`UserPromptSubmit` is partial:** blocking plus plain-stdout or JSON context work, but the common `systemMessage` and `{"continue": false}` controls are not enforced.
- **`PreToolUse` is partial:** blocking works, but `additionalContext`, `permissionDecision: "allow"`, and `updatedInput` are ignored. Every tool is represented as `tool_input: { command }`, so non-shell tool arguments are not faithfully exposed to the hook.
- **`PostToolUse` is partial:** blocking feedback and JSON `additionalContext` work, but `{"continue": false}` is not enforced, non-shell tool arguments are reduced to `{ command }`, and structured tool output is flattened to text in `tool_response`.
- **`Stop` is partial:** blocking forces another model turn, but `stop_hook_active` is always `false`, `last_assistant_message` is always `null`, and `{"continue": false}` is not enforced. An unconditionally blocking hook force-continues up to `stopLoopGuardMax` consecutive times per session and then lets the turn end (the loop guard replaces `TODO(stop-loop-guard)`; `stopLoopGuardMax: 0` restores the historical always-continue behavior).
- **Common payload and output fields are partial:** every mapped event reports the statically configured `model` instead of the current Codex runtime model. `permission_mode` is derived from the harness's effective sandbox/approval policy (`bypassPermissions` under `danger-full-access`, `dontAsk` under `never`, else `default`), falling back to `default` when neither seam is mounted. `systemMessage` is logged + warned but not surfaced, and `{"continue": false}` is recorded but does not apply Codex's event-specific stop behavior (`TODO(hook-continue-false)`).
- **Config loading and execution are partial:** one process-level `configPath` is parsed at load; Codex's active user, project, session, system/managed, and plugin layers, trust controls, and inline `config.toml` hook form are not implemented (`TODO(per-session-hook-config)`). Only synchronous `command` handlers run, current metadata such as `statusMessage` and `commandWindows` is ignored, and matching handlers run serially rather than with Codex's concurrent launch semantics.
