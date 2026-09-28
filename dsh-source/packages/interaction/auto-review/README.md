# @deepseek-ai/dsh-auto-review

English | [中文](README.zh.md)

Policy-driven safety review of approval-bound tool requests. Mounted as an `approval/request` answerer, this plugin asks a dedicated reviewer subagent to classify a request's risk, then maps the reviewer's verdict through a configured rule policy into an `allowed-once`, `rejected`, or delegated outcome. Review is opt-in via `enabled`; when it is off or any stage fails, the request fails closed by delegating to the next answerer.

The reviewer is a scoped subagent that receives the tool name and reason plus the threat categories the request exhibits, runs with no tools of its own, and returns a structured `{ risk, decision, reason? }` verdict. `decision` is the reviewer's raw recommendation; the answerer applies the policy `rules` to the final verdict, so a `deny` recommendation and a policy `allow` rule can both gate a request.

Each review appends a log-only `approval/review` session event with the final `risk`, `decision`, and verdict, so the audit trail is complete without adding reviewer prompts to the model-visible context. The [auto-review-invariant](../../../.agents/notes/implemented/feature/2026-08-24-auto-review.md) package owns a runtime invariant validating that these records carry only known grades.

## Policy mapping

`ReviewPolicy` holds a `rules` list and a `noMatch` fallback. `decide()` compares each rule's `categories` and `minRisk` against the request's classified categories and the reviewer's `risk`; the first matching rule's `decision` becomes the verdict, and no match falls back to `noMatch`. A rule `decision` of `allow` maps to `allowed-once`; `deny` maps to `rejected`; anything else delegates. The `Reviewer` seam is swappable, so the policy logic is unit-testable independent of the subagent transport.

## Model Experience

### Review context contribution

#### What the model sees

Nothing. The reviewer subagent runs in a child session and its prompt, tool list, and structured verdict never reach the parent agent's context. `approval/review` is log-only; the model sees only the asking consumer's eventual allowed or rejected tool outcome, exactly as it would through the approval seam without review.

#### Token effect

Zero tokens in the parent context for the review itself. The reviewer child consumes model tokens in its own session, bounded by the reviewer's own completion; that cost is invisible to the parent.

#### KV Cache effect

The parent prefix is unchanged by review, so existing KV-cache entries remain valid. Reviewer work happens in the child and does not perturb the parent's cached prompt.

## Known Limitations and Deferred Work

- **Policy is static per review** — rules are fixed config, not a learned or per-session policy; rule revocation and grant memory are deferred.
- **The reviewer is a general-purpose subagent** — it is constrained by a narrow tool set and structured output but has no dedicated threat-analysis profile or calibrated risk model; severity calibration is deferred.
- **Review does not override the approval service** — enforcement stays with `ApprovalPolicy`; auto-review only decides the outcome of an already-eligible request and cannot turn a `'never'` request into an interactive prompt.
- **No review of model-free risks** — the reviewer cannot inspect the actual tool arguments or filesystem effects, only the tool name and reason; argument-level sandboxing remains the sandbox packages' job.
