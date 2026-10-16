import { defineTool } from '@taskweaver/dsh-tools';
import { OrchestrationToolError } from '@taskweaver/dsh-orchestration';
export const name = 'tool-orchestrate';
export const inject = ['tools', 'orchestration'];
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'orchestrate',
        description: 'Use this tool when a coding request is large enough to benefit from a planned DAG of independent specialist tasks. TaskWeaver will plan, execute, verify, and summarize the DAG; do not spawn subagents directly. For simple or read-only requests, continue with the regular tools.',
        parameters: {
            goal: {
                type: 'string',
                required: true,
                description: 'The user’s complete objective and constraints. Preserve the original acceptance criteria and mention any key focus you identified.',
            },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    summary: { type: 'string', required: true },
                    task_count: { type: 'integer', required: true },
                    failed_task_count: { type: 'integer', required: true },
                    cancelled: { type: 'boolean', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: value.summary }],
        },
        async execute(args, exec) {
            if (!exec.agent || !exec.callId) {
                throw new OrchestrationToolError('orchestrate requires a live root agent and tool-call id', 'MISSING_CALLER');
            }
            const result = await ctx.orchestration.run({
                goal: args.goal,
                callId: exec.callId,
                agent: exec.agent,
                signal: exec.signal,
            });
            return {
                summary: result.summary,
                task_count: result.taskCount,
                failed_task_count: result.failedTaskCount,
                cancelled: result.cancelled,
            };
        },
    }));
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map