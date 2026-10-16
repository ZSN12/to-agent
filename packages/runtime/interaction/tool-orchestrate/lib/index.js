import { defineTool } from '@taskweaver/dsh-tools';
import { OrchestrationToolError } from '@taskweaver/dsh-orchestration';
export const name = 'tool-orchestrate';
export const inject = ['tools', 'orchestration'];
export function apply(ctx) {
    ctx.tools.register(defineTool({
        name: 'orchestrate',
        description: 'Call this when the task can be split into two or more independent parts, or needs parallel research across modules. TaskWeaver plans, routes, executes, verifies, and summarizes the DAG. For simple tasks, use the regular tools directly.',
        parameters: {
            goal: {
                type: 'string',
                required: true,
                description: 'The user’s complete objective and constraints. Preserve the original acceptance criteria and mention any key focus you identified.',
            },
            context: {
                type: 'string',
                description: 'Optional facts, findings, or file references already gathered by the main agent.',
            },
            readOnly: {
                type: 'boolean',
                description: 'Set true when the request must not modify files or run write commands.',
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
                    task_statuses: {
                        type: 'array', required: true,
                        items: { type: 'object', additionalProperties: false, properties: {
                                id: { type: 'string', required: true },
                                title: { type: 'string', required: true },
                                status: { type: 'string', required: true },
                            } },
                    },
                    changed_files: { type: 'array', required: true, items: { type: 'string' } },
                },
            },
            render: (_args, value) => {
                const lines = [value.summary];
                if (value.task_statuses.length > 0) {
                    lines.push('', '子任务状态：', ...value.task_statuses.map(task => `- ${task.title}：${task.status}`));
                }
                if (value.changed_files.length > 0)
                    lines.push('', '改动文件：', ...value.changed_files.map(file => `- ${file}`));
                return [{ type: 'text', text: lines.join('\n') }];
            },
        },
        async execute(args, exec) {
            if (!exec.agent || !exec.callId) {
                throw new OrchestrationToolError('orchestrate requires a live root agent and tool-call id', 'MISSING_CALLER');
            }
            const result = await ctx.orchestration.run({
                goal: args.goal,
                ...(args.context === undefined ? {} : { context: args.context }),
                ...(args.readOnly === undefined ? {} : { readOnly: args.readOnly }),
                callId: exec.callId,
                agent: exec.agent,
                signal: exec.signal,
            });
            return {
                summary: result.summary,
                task_count: result.taskCount,
                failed_task_count: result.failedTaskCount,
                cancelled: result.cancelled,
                task_statuses: result.taskStatuses,
                changed_files: result.changedFiles,
            };
        },
    }));
}
export default { name, inject, apply };
//# sourceMappingURL=index.js.map