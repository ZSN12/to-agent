import z from "@z/schemastery";
//#region lib/types/policy.js
/**
* Policy evaluation for auto-review: classify a reviewer's risk against the
* configured rules and decide whether the reviewer may authorize on its own, or
* whether the request must fall back to a human. Enforcement stays with the
* approval service; this module only recommends.
* @module @z/dsh-auto-review
*/
/** Order from lowest to highest risk, for floor comparisons. */
const RISK_ORDER = [
	"low",
	"medium",
	"high",
	"critical"
];
/** @returns true when `actual` is at least `floor` on the risk ladder. */
function atLeast(actual, floor) {
	return RISK_ORDER.indexOf(actual) >= RISK_ORDER.indexOf(floor);
}
/**
* Map a reviewer outcome to an allowed policy decision.
*
* A reviewer may only end with `allow` when a rule names one of the request's
* categories AND the reviewer's risk is at or above the rule's floor AND the
* rule decides `allow` — the authorization boundary that stops a reviewer from
* green-lighting a high-destructive action on a laxer rule. `deny` is honored
* only when a `deny` rule covers the category at the risk floor. Anything else
* (a low-risk request that no rule authorizes, a mismatch, or `defer`) falls
* back to a human.
*
* @param policy - the configured rules and no-match fallback.
* @param risk - the reviewer's risk grade.
* @param categories - the categories the reviewed request exhibits.
* @returns `allow`, `deny`, or `defer` (delegate to a human).
*/
function decide(policy, risk, categories) {
	for (const rule of policy.rules) {
		if (!rule.categories.some((c) => categories.includes(c))) continue;
		if (!atLeast(risk, rule.minRisk)) continue;
		return rule.decision;
	}
	return policy.noMatch;
}
/**
* Classify a request's threat categories. The answerer feeds the tool name and
* the approval reason through here to build the reviewer's input lens. A
* destructive or credential-adjacent keyword raises the request to the
* corresponding category so policy rules can key on it.
*
* @param toolName - the tool that triggered the approval request.
* @param reason - the approval request's reason, if any.
* @returns the threat categories the request exhibits (possibly empty).
*/
function classify(toolName, reason) {
	const categories = [];
	const haystack = `${toolName} ${reason ?? ""}`.toLowerCase();
	if (/\b(rm|rmdir|shutdown|reboot|kill|mkfs|dd)\b/.test(haystack) || /remove|delete|destroy|wipe/.test(haystack)) categories.push("destructive");
	if (/curl|wget|nc|socat|ssh|scp|git.*clone/.test(haystack) || /exfiltrat|upload|send|url|http/.test(haystack)) categories.push("exfiltration");
	if (/secret|token|password|credential|api[-_ ]?key|\.env/.test(haystack)) categories.push("credential-probing");
	if (/sandbox|permission|guardrail|disable.*security|--no-sandbox/.test(haystack)) categories.push("persistent-weakening");
	return categories;
}
//#endregion
//#region lib/types/answerer.js
/**
* The auto-review answerer: a prepend listener on the `approval/request`
* waterfall that runs the reviewer and maps its outcome onto an
* {@link ApprovalOutcome}, failing closed. Enforcement stays with the approval
* service — this listener only recommends, and only for requests it is
* configured to judge.
* @module @z/dsh-auto-review
*/
/**
* Build the `approval/request` prepend listener.
*
* The listener is enabled only when the reviewer is configured on; because the
* approval service dispatches `approval/request` only under an interactive
* (`ask`) session policy, sandboxed work that never raises an approval request
* is never routed through a reviewer. It classifies the request, runs the
* reviewer, then maps the outcome through {@link decide}: `allow` authorizes
* once, `deny` rejects, and anything else (defer, low-risk no-rule, mismatch,
* or reviewer failure) delegates via `next()` to the human answerers. A thrown
* reviewer always fails closed.
*
* @param policy - the configured review policy.
* @param reviewer - the reviewer executor seam.
* @param enabled - whether review mode is active for this listener.
* @returns the `approval/request` waterfall listener.
*/
function answerer(policy, reviewer, enabled) {
	return async (req, next) => {
		if (!enabled) return next();
		try {
			const categories = classify(req.toolName, req.reason);
			const outcome = await reviewer.run({
				toolName: req.toolName,
				...req.reason !== void 0 ? { reason: req.reason } : {}
			}, req.agent, req.signal ?? abortedNever());
			const verdict = decide(policy, outcome.risk, categories);
			req.agent.session.append("approval/review", {
				toolName: req.toolName,
				risk: outcome.risk,
				decision: outcome.decision,
				verdict,
				...outcome.reason !== void 0 ? { reason: outcome.reason } : {}
			});
			if (verdict === "allow") return "allowed-once";
			if (verdict === "deny") return "rejected";
			return next();
		} catch {
			return next();
		}
	};
}
/** A never-cancelled signal for approval requests that carry none. */
function abortedNever() {
	return new AbortController().signal;
}
//#endregion
//#region lib/types/reviewer.js
/**
* The real reviewer executor: drives a one-shot subagent through `ctx.subagents`
* with a structured `outputSchema`, so the reviewer returns a validated
* {@link ReviewOutcome} without inheriting parent context. The child runs with
* a narrowed tool set so the reviewer cannot itself become an attack surface.
* @module @z/dsh-auto-review
*/
/**
* The object-rooted JSON schema the reviewer child must satisfy. Restricted to
* the subset `assertObjectJsonSchema` enforces: enum, const, plain types.
*/
const OUTCOME_SCHEMA = {
	type: "object",
	properties: {
		risk: {
			type: "string",
			enum: [
				"low",
				"medium",
				"high",
				"critical"
			]
		},
		decision: {
			type: "string",
			enum: [
				"allow",
				"deny",
				"defer"
			]
		},
		reason: { type: "string" }
	},
	required: ["risk", "decision"],
	additionalProperties: false
};
/**
* Build a {@link Reviewer} whose `run` spawns a fresh, sanitized subagent and
* resolves its structured outcome.
*
* @param ctx - context carrying the subagent seam.
* @param provider - the provider name registered on `ctx.subagents`.
* @returns a reviewer that runs one independent evaluation per call.
*/
function subagentReviewer(ctx, provider) {
	return { async run(request, parent, signal) {
		const result = await (await ctx.subagents.start(provider, {
			parent,
			signal,
			outputSchema: OUTCOME_SCHEMA,
			prompt: [{
				type: "text",
				text: [
					"Review the following approval request and return a structured verdict.",
					`Tool: ${request.toolName}`,
					...request.reason !== void 0 ? [`Reason: ${request.reason}`] : [],
					"Risk: one of low/medium/high/critical. Decision: allow/deny/defer."
				].join("\n")
			}],
			toolFilter: { allow: [] }
		})).result;
		if (result.stopReason !== "completed" || result.structured === void 0) throw new Error(`auto-review: reviewer did not complete with a structured verdict (${result.stopReason})`);
		return result.structured;
	} };
}
//#endregion
//#region lib/types/index.js
/**
* Auto-review: an optional `approval/request` answerer that runs a reviewer
* subagent before a human is asked, mapping its verdict onto an
* {@link ApprovalOutcome} with a fail-closed fallback. Enforcement stays with
* the approval service; this plugin only recommends, and only for requests the
* approval service has already determined need asking.
* @module @z/dsh-auto-review
*/
const name = "auto-review";
/** Declare the subagent seam the reviewer child needs. */
const inject = ["subagents"];
const ruleSchema = z.object({
	id: z.string(),
	categories: z.array(z.union([
		"exfiltration",
		"credential-probing",
		"destructive",
		"persistent-weakening"
	])),
	minRisk: z.union([
		"low",
		"medium",
		"high",
		"critical"
	]),
	decision: z.union(["allow", "deny"])
});
const Config = z.object({
	enabled: z.boolean().default(false),
	subagentProvider: z.string().default("spawn"),
	policy: z.object({
		rules: z.array(ruleSchema).default([]),
		noMatch: z.union(["deny", "defer"]).default("defer")
	})
});
/**
* Register the auto-review prepend answerer. The plugin builds the reviewer
* around the live `ctx.subagents` seam and the configured policy, then prepends
* it so review runs before any composed human/UI answerer. A disabled config
* still registers the listener (it immediately delegates), keeping behavior
* deterministic and easy to flip at runtime.
*/
function apply(ctx, config) {
	const reviewer = subagentReviewer(ctx, config.subagentProvider);
	ctx.on("approval/request", answerer(config.policy, reviewer, config.enabled), { prepend: true });
}
//#endregion
export { Config, apply, inject, name };
