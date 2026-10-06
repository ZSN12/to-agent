# Agent idle-history recovery smoke — 2026-10-03

## Reproduction

Using the real deployed Z Host with a local deterministic OpenAI-compatible test provider (no paid API, no user data): hold `/compact` for 31 seconds, then create a second conversation and send a read-only prompt. The model response and `turn/end` were present in the second session's durable history, but the already-open mux delivered no session frames. The conversation remained marked running. Reopening a fresh mux showed the completed history, proving this was a live-event delivery gap rather than context exhaustion or a missing model response.

## Change

- Record a session-history sequence baseline before starting a turn when no mux baseline exists.
- If an active non-command turn receives no live events for 10 seconds, reconcile the durable history from the last observed sequence. Backfill through the same sequence-deduplicated event handler; retry at bounded intervals up to 30 seconds while the turn remains active.
- Cancel the reconciliation timer when the turn finishes or the chat service stops. Do not resubmit a prompt or infer completion from transport health.
- The deployed lifecycle test holds compaction for 31 seconds, then verifies fresh-session responses and cancellation still settle. The ordinary fast path remains unchanged when mux events arrive.

## Verification

- `npm run build:z-runtime` — passed.
- `node scripts/test-z-command-lifecycle.mjs` — passed, including the 31-second idle gap and cancellation path.
- `npm run test:dsh-chat` — passed.
- `npm run test:z-recovery` — passed (parallel Agents, native history recovery, approval/question replay, retry exhaustion, cancellation).
- `vendor/z-runtime`: `vitest run packages/host/apiproxy/tests/api-proxy-view.spec.ts` — passed, including cross-scope mux subscriptions.
- `git diff --check` — passed.

## Remaining limitation

The smoke confirms the bridge can recover and display completed work from durable history, but it does not identify why the original mux stopped forwarding events in this exact long-idle sequence. Until that transport path is separately isolated, a silent active turn may show no new text for up to 10 seconds before the first history reconciliation.
