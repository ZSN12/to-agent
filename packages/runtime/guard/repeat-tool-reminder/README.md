# @z/dsh-repeat-tool-reminder

English | [中文](README.zh.md)

Not a model-facing tool: it never appears in the tool list or rewrites a call. It watches each agent's tool stream, sends escalating reminders for consecutive identical calls and repeated reads of the same file, and detects a repeated `glob`/`grep` sequence of 2–8 calls using the normalized scope and canonical query/options. For TaskWeaver read-only subagents, it nudges after two and four searches without a source read, and gives a stronger progress reminder at six searches in an assigned scope. To prevent endless retries, it allows at most ten search attempts in one assigned scope, eight reads of one file, and three executions of an identical read; the next matching call is denied, with one model recovery response before another retry ends that agent turn. A read clears only the two/four-search nudge counter, not the repeated-search guard. Different paths and scopes remain available; distinct ranges of one file are allowed up to its per-turn read limit. Same-file read counts survive intervening searches and reads of other files; they reset on a new user turn. After an identical search sequence runs twice, it also denies the next matching search and latches that scope for the rest of the agent turn. A new user turn clears these latches. These are narrow loop/retry guards, not a task-wide limit on total calls, duration, or tokens. Decision record: [the repeat-tool-reminder Agent Note](../../../.agents/notes/archived/feature/2026-07-08-repeat-tool-guard.md).

When the current user turn carries a TaskWeaver read-only subtask scope marker, the plugin also enforces workspace-relative paths before `read`/`read_image`/`glob`/`grep`/`find`/`ls` execute. Ordinary DSH sessions without the marker are unchanged; a malformed marker fails closed for filesystem reads/searches. An out-of-scope call is denied with guidance to use gathered evidence, continue within scope, or report the evidence gap. Bounded retries for repeated searches/reads apply only inside this TaskWeaver read-only scope; they do not cap the task as a whole.

## Config

```yaml
- id: repeat-tool-reminder
  name: '@z/dsh-repeat-tool-reminder'
  config:
    thresholds: [3, 5, 8]        # default; repeated-call / same-file-read reminder counts
    include: []                  # tool-name patterns to track; empty ⇒ all tools
    exclude: [todo_write]        # tool-name patterns transparent to the chain
    argumentsPreviewChars: 500   # default; cap on arguments quoted in the detailed reminder
```

`thresholds` fails loud at plugin load: an empty list, a non-integer, a value below 2, or a duplicate throws, never a silent fall-back to defaults; `argumentsPreviewChars` equally rejects anything but an integer >= 1. The list is normalized to ascending order; the FIRST threshold delivers a short generic nudge, later thresholds deliver the detailed form naming the tool, the run length, and the canonical arguments. Past the highest threshold, reminders recur at the spacing between the last two thresholds (or at the sole threshold's spacing when only one is configured), so a long loop does not go silent after a few nudges. Arguments are head-truncated at `argumentsPreviewChars` with an omitted-count marker, so a looping `write`/`edit` payload cannot ride into the next request unbounded (the chain key always compares the FULL canonical string; the cap bounds the reminder, never the detection).

`include`/`exclude` entries support `*` wildcards and are predicates over whatever tools exist at call time, not references to registry entries — a pattern matching no currently registered tool is NOT an error (`exclude: [mcp_*]` stays valid in a deployment that loads no MCP tools), unlike `toolOrder`'s referent check.

## Chain semantics

The exact-call chain key is `(tool name, canonical arguments)` — canonicalization is a deep key-sort plus `JSON.stringify`, so argument objects differing only in property order count as identical. A call identical to the previous tracked call increments the agent's consecutive counter; a different tracked call resets it to 1. Separately, reads are counted by normalized file path for the current user turn, regardless of searches or reads of other paths between them; these counters are advisory only and do not block reading another needed range.

- **Untracked calls are transparent to the chain.** A call excluded by `include`/`exclude` neither increments nor resets the counter, so `grep X → todo_write → grep X` still counts as two consecutive `grep X` when `todo_write` is excluded. This is what makes exclusion useful: bookkeeping tools interleaved into a loop must not launder it.
- **Denied calls count.** Detection sits on `tools/post-execute`, which also runs for calls a `tools/pre-execute` listener denied — a model hammering a denied call is exactly the loop worth breaking.
- **Calls without an agent are ignored.** A direct `ctx.tools.execute()` caller has no model to remind and no live agent object to key on.
- **Per-agent keying.** The tool registry is context-level and subagents interleave through the same waterfall, so `WeakMap<Agent, …>` keys exact-call and per-file read counts by the live agent object; one agent's repetition never trips another's reminder. A user prompt (`agent/pre-step`) resets the submitting agent's counters, and object lifetime bounds the weak entries without a disposal listener.
- **Repeated search-cycle breaker.** The guard remembers only the recent suffix of tracked `glob`/`grep` calls as tool, normalized scope, and canonical query/options triples; different patterns at the same directory do not count as the same call. A non-search call resets that suffix. If the same 2–8 triple sequence repeats twice, the next matching call is denied before filesystem search runs, and that scope is latched for the remainder of the agent turn. The denial directs the one recovery response to use gathered evidence and answer rather than restart broad discovery; direct reads of already-known paths remain available. Retrying the blocked scope ends the turn at the next step boundary, before another LLM request. A new user turn clears the latch. This is a bounded recovery for a detected exact cycle, not a cumulative per-task call limit.
- **TaskWeaver read-only loop guard.** Within each literal assigned search scope, ten varied `glob`/`grep`/`find`/`ls` attempts are allowed; a progress reminder arrives at six. Reads do not reset this counter. The next search is denied, one model recovery response may switch to reading, another scope, or a final answer, and retrying that denied scope ends the turn before another LLM request. An identical `read`/`read_image` call can execute three times; the fourth is denied. Reads of one file are capped at eight per agent turn even when the model keeps varying line ranges; after the first denial, one recovery response may use a different authorized file or finish, while retrying the blocked file ends the turn before another LLM request. Other authorized files and scopes, and remaining task work stay available. These counters reset on a new user-authored turn; they are not task-wide call, duration, or token budgets.
- **TaskWeaver read-only path scope.** It activates only when the current user turn contains `<taskweaver-readonly-scope-v1>{"paths":[...]}</taskweaver-readonly-scope-v1>`. Each entry must be a literal workspace-relative path; absolute paths, the workspace root, wildcards, and `..` are rejected. Listed files/directories and descendant paths are accessible; other reads/searches are denied before execution. A `glob` call rooted at `.` is allowed only when its pattern is itself a literal path inside the assigned scope; wildcard/root-wide searches remain denied. A new user turn without a marker does not inherit the previous turn's scope. For marked TaskWeaver subagents, valid in-scope reads are additionally limited to eight attempts per file per agent turn, with one recovery response; ordinary Host sessions without the marker have no per-file read cap.
- **In-memory only.** A session resumed from persistence starts with a fresh chain — the guard is a heuristic nudge, not a logged invariant, later reminders are the accepted cost.

## Reminder delivery

Reminders ride the post-execute decision's `additionalContexts` (source `{kind: 'plugin', plugin: 'repeat-tool-reminder'}`), never a `content` replacement: the `tool/result` event stays the tool's own output for audit. The loop buffers the context and appends it as an injected `user/message` after the step's tool results, which the session renders as a plain synthetic user message — so the reminder is model-visible, source-attributed, and reconstructable from the session log with no new session event. The reminder listener delegates via `next()` and prepends its context to the downstream decision's context array (both variants — a blocked call still gets the nudge); the separate search-cycle breaker denies before dispatch and explains why in the tool result.

## Model Experience

### First-threshold context message

#### What the model sees

At the first configured consecutive-repeat threshold, that agent receives the reminder below. No tool schema or normal-call text is added.

##### First-threshold reminder

```markdown
You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.
```

#### Token effect

Zero tokens before the threshold. The reminder is retained history for that agent.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

### Later-threshold context message

#### What the model sees

A later threshold receives the detailed reminder template below. A capped argument preview ends exactly `… (+<omitted> more chars)`.

##### Later-threshold reminder

```markdown
Repeated tool call detected:
- tool: <toolName>
- consecutive_calls: <count>
- arguments: <canonicalArguments>
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.
```

#### Token effect

Each reminder is retained history; `argumentsPreviewChars` bounds its data-dependent argument text, while agents keep independent counters.

#### KV Cache effect

Append-only; newly visible content follows the reusable request prefix and does not invalidate existing KV-cache entries.

## Known Limitations and Deferred Work

- **Exact-cycle trigger** — cycle activation requires an exact canonical sequence, so changed queries or options may delay the initial latch; once triggered, all `glob`/`grep` calls at that scope are denied for the rest of the turn.
- **Compaction does not reset chains** — a chain spanning a compaction checkpoint keeps counting.
- **No cross-turn persistence** — repeat chains reset for a new user-authored task and are not persisted across process restart.
- **No subagent chain-sharing** — chains stay isolated per agent; a parent and its subagent repeating the same call never combine.
- **Legitimate idempotent polling still draws nudges** past the thresholds — the pressure valves are `thresholds`/`exclude` config.
