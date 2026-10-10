# Prompt evaluation

The checked-in suite is deterministic and offline by default:

    pnpm run test:prompt-eval

It snapshots the five active presets, four task profiles, planner request, and
planner synthesis. The static gate checks exact source-to-snapshot equality,
SHA-256 hashes, byte/token estimates, known size debt, stable prefixes under
different model/workspace/date values, and repository-specific path leakage.
The 30-case behavior fixture covers planner JSON, read-only responses,
implementation reports, language following, and quoted-content injection.

To run the behavior set against two model endpoints and compare the current
prompts with the preserved legacy snapshots, explicitly provide provider
settings and opt in:

    TASKWEAVER_PROMPT_EVAL_A_NAME=provider-a \
    TASKWEAVER_PROMPT_EVAL_A_BASE_URL=https://provider-a.example/v1 \
    TASKWEAVER_PROMPT_EVAL_A_MODEL=model-a \
    TASKWEAVER_PROMPT_EVAL_A_API_KEY=... \
    TASKWEAVER_PROMPT_EVAL_B_NAME=provider-b \
    TASKWEAVER_PROMPT_EVAL_B_BASE_URL=https://provider-b.example/v1 \
    TASKWEAVER_PROMPT_EVAL_B_MODEL=model-b \
    TASKWEAVER_PROMPT_EVAL_B_API_KEY=... \
    node scripts/eval-prompts.mjs --run-models --record

This makes 120 completion requests: 30 cases × two prompt versions × two
providers. API keys are read only from the environment and are not written to
the result file. Recorded runs include the dataset hash, prompt hashes, model
names, pass rates, provider-reported token usage, and cache-read metrics when
available. They do not store prompts or model responses.

The live adapter uses text-only OpenAI-compatible Chat Completions. Its
read-only and report assertions inspect generated text; they cannot prove
filesystem state, tool use, or that a claimed verification command actually
ran. Those properties require a tool-enabled Host integration evaluation.
Token estimates use UTF-8 bytes / 4; provider token usage is reported
separately when the endpoint returns it.
