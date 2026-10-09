# subagent/ — subagent capability family

English | [中文](README.zh.md)

This family lets an agent delegate work to child agents. Multiple named providers may coexist in one context.

| Package | Role | ctx key |
|---|---|---|
| [`subagent/`](subagent/README.md) | Defines provider registration, delegation, and continuation | `ctx.subagents` |
| [`subagent-inprocess/`](subagent-in-process-driver/README.md) | Provides the shared in-process run driver | — |
| [`subagent-spawn-in-process/`](subagent-spawn-in-process/README.md) | Starts a fresh in-process child | registers on `ctx.subagents` |
| [`subagent-fork-in-process/`](subagent-fork-in-process/README.md) | Starts an in-process child from the parent's completed history | registers on `ctx.subagents` |
| [`tool-subagent/`](tool-subagent/README.md) | Exposes delegation to the model | registers on `ctx.tools` |
| [`tool-subagent-control/`](tool-subagent-control/README.md) | Exposes child messaging and listing to the model | registers on `ctx.tools` |
| [`tool-subagent-report/`](tool-subagent-report/README.md) | Provides the child-to-parent report channel | registers in child scopes |

TaskWeaver provides its own in-process child-agent providers. External Agent SDK integrations are outside the supported runtime and are not installed by the application.
