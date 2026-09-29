# Agent Note: Deferred gap-closure designs from the DSH-vs-Codex comparison

Status: proposed

English | [中文](2026-08-24-deferred-gap-closure.zh.md)

## Problem

The DSH-vs-Codex gap review produced five design documents in `research/design/`. Two shipped as implemented features in this change set: `03-hooks-codex` (all P0 and P2 hook points) and `02-auto-review` (a new `@z/dsh-auto-review` approval-request answerer). The remaining three designs — the compaction-seam PreCompact/PostCompact extension, the SOCKS5 network-access-control capability, and the persistent-memory package — are each cross-package, high-blast-radius changes. Completing any of them to the repo's implementation and verification discipline is beyond what this change set can carry, and shipping a partial or unverified version would silently weaken the guarantees the invariant and coverage gates exist to protect.

## Proposal

Record three cross-package designs from `research/design/` as honest, deferred follow-ups. Two sibling designs already shipped implemented in this change set: `03-hooks-codex` (all P0 and P2 hook points: Stop loop-guard, `permission_mode`, `PermissionRequest` answerer, `SubagentStart`/`SubagentStop`) and `02-auto-review` (the new `@z/dsh-auto-review` approval-request answerer). The three remaining items are each a high-blast-radius change that cannot be completed to repo discipline — per-file 100% coverage, a REAL-composition test, a runtime-invariant companion, bilingual README, and doc-sync — within the available rounds. They are recorded here rather than claimed as done, and each keeps its design document as the authoritative spec.

### PreCompact / PostCompact hooks (compaction-seam extension)

Codex `PreCompact`/`PostCompact` hook points map to the `dsh-compaction` seam. `PreCompact` must run before a compaction starts and veto it via `continue: false`; `PostCompact` must run after compaction completes and inject `additionalContext` into the follow-up request. The compaction Service Definition currently appends `compaction/start`/`compaction/end` session events but exposes no pre/post interception points that can veto or inject. Completion requires adding two extension points to the `dsh-compaction` seam (a before-compact waterfall that can cancel, and an after-compact notification that can supply follow-up context) and bridging them in `hooks-codex` as `PreCompact`/`PostCompact` hook events. This touches a core session-behavior package every deployment relies on.

### 01-network-access-control (SOCKS5 proxy capability)

`01-network-access-control.md` proposes an optional network egress capability: a SOCKS5 proxy consumer that routes a tool's outbound connections through a configurable proxy so a deployment can enforce egress policy. This is a new capability seam (Service Definition + provider + consumer) over the web/network tooling, plus policy and REAL-composition coverage. Scope is comparable to `auto-review` but requires a new network transport boundary.

### 04-memory (persistent memory package)

`04-memory.md` proposes a persistent agent-memory capability (cross-session facts, recalls, and storage policy). This is a new product-level package with its own Service Definition, provider, and consumers, plus durability and projection requirements needing a REAL-composition test and a runtime-invariant companion. Its blast radius overlaps session persistence and the workspace/durable-storage seams.

## Alternatives considered

**Ship a partial version of one deferred design now.** A partial compaction-seam extension or network capability would be unusable or would silently weaken the guarantees the invariant and coverage gates exist to protect, so it is rejected. Deferring each design intact keeps the spec coherent for a later, disciplined implementation.

**Drop the deferred items from the record.** Removing them would hide known work. The proposed notes and the goal objective carry them explicitly so the follow-ups stay actionable.

## Acceptance criteria

- Each deferred item names its authoritative design document (`research/design/01-network-access-control.md`, `research/design/04-memory.md`, and the PreCompact/PostCompact section of `research/design/03-hooks-codex.md`).
- No deferred item is reported as implemented; the note states each is not started and why.
- The note passes the Agent Note format gate and the bilingual translation-pairing gate.
- When any item is picked up, it ships with the full repo discipline this note lists, and this note is then updated or archived accordingly.

## Risks

- **Scope creep** — a deferred item could be misinterpreted as "decided against". The note's Proposal section names each as pending with its spec, not rejected.
- **Silent completion** — an agent might later mark a deferred item done without the full verification. The acceptance criteria require the full repo discipline before the note is updated to reflect shipping.
- **Drift** — the design docs could age. The note points at them as the current authority, so a later pick-up starts from the latest spec.
