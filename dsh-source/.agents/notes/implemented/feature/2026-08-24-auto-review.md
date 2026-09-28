# Agent Note: Approval-bound tool review as a policy-driven answerer

Status: implemented

English | [中文](2026-08-24-auto-review.zh.md)

## Problem

The approval seam grants or rejects a tool request through a channel-neutral answerer, but the answerer itself has no product-level opinion about whether a request is safe. A deployment that wants a second opinion before a destructive or credential-adjacent command either hand-writes an `approval/request` listener or forgoes review entirely. Adding the reviewer directly to the approval service couples a neutral seam to one review policy.

## Decision

A separate `@deepseek-ai/dsh-auto-review` function plugin registers itself as a prepended `approval/request` answerer. When `enabled`, it classifies the request's threat categories, asks a dedicated reviewer subagent for a structured verdict, applies a configured `ReviewPolicy`, and maps the result to an `ApprovalOutcome`. Enforcement stays with the approval service: auto-review only decides the outcome of a request that is already eligible, and cannot turn a `'never'` policy into an interactive prompt.

### Reviewer subagent

The reviewer runs as a scoped subagent through the standard subagent seam (`ctx.subagents.start`). It receives the tool name, reason, and the classified threat categories, is constrained to no tools of its own (`toolFilter: { allow: [] }`), and returns a structured `ReviewOutcome` (`{ risk, decision, reason? }`). A child that fails to complete with a structured verdict makes the answerer fail closed by delegating to the next listener. The structured output tool survives the empty tool filter because the in-process driver attaches it after the filter is applied.

### Policy mapping

`ReviewPolicy` holds a `rules` list and a `noMatch` fallback. Each rule names a set of `categories`, a `minRisk` floor, and a `decision` of `allow` or `deny`. `decide()` compares the classified categories and the reviewer's risk grade against each rule in order; the first match yields the verdict, and no match falls back to `noMatch`. An `allow` verdict maps to `allowed-once`, `deny` to `rejected`, and anything else (including `defer` or `noMatch: 'defer'`) delegates to the next answerer. The `Reviewer` is a swappable seam, so the policy logic is unit-tested independent of the subagent transport.

### Audit trail

Each review appends a log-only `approval/review` session event carrying the final `risk`, `decision`, and `verdict`, mirroring the existing `approval/asked`/`approval/decided` audit events. A runtime invariant companion (`@deepseek-ai/dsh-auto-review/invariant`) validates that these records carry only known grades, so a malformed review cannot silently pollute the durable log.

## Alternatives considered

**Put review inside the approval service.** This couples a neutral, channel-agnostic seam to one product-specific policy and forces the service to own a subagent lifecycle. A separate answerer keeps the service's scope and leaves composition to the deployment.

**Require the human to be the only reviewer.** The seam already supports that through its own answerers. Auto-review is an additional, opt-in machine reviewer, not a replacement for the approval service's policy or the human answerers.

**Broaden the `ApprovalPolicy` union with a review mode.** Extending `'ask'`/`'never'` would touch every `assertNever` boundary and conflate "who may decide" with "what decision to make". Auto-review lives entirely in an answerer and leaves the union untouched.

## Verification

Package tests cover the pure `classify` and `decide` functions, the answerer's disabled/delegate/allow/deny/throw paths, the invariant's accept and reject cases, and a real-composition test that mounts the agent loop, the in-process spawn subagent provider, and the plugin on one context with a scripted mock model driving the reviewer child through a structured verdict. A disposal test proves the `approval/request` listener is removed when the plugin fiber is disposed (HMR safety). Source reaches 100% coverage.

## Consequences

Deployments that want a second opinion enable the plugin and configure a policy; those that do not are unaffected because review is off by default. Reviewer tokens are spent in a child session and are invisible to the parent context. The reviewer's risk grading is not calibrated to a dedicated threat model; severity calibration and per-session/learned policy are deferred to later work. Enforcement authority remains with the approval service, so auto-review narrows the decision it is allowed to make rather than expanding the service's power.
