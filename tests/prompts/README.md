# Prompt regression

`node scripts/test-eval-prompts.mjs` checks the checked-in snapshots, byte/token estimates, prefix stability, forbidden paths, and the 30-case dataset without network access. `node scripts/eval-prompts.mjs --strict` also fails on the size and prefix debt already present in the captured baseline.

When a prompt change is intentional, review the rendered diff first, then run `node scripts/eval-prompts.mjs --update-snapshots`. The command preserves the previous prompt text under `snapshots/legacy/` before advancing the current snapshot, so behavior runs compare old and new versions. New static violations are not accepted automatically; `--accept-new-violations` is reserved for explicitly reviewed baseline changes. The manifest keeps prompt hashes, source paths, and the preserved baseline metadata.

Optional model behavior comparison uses the current prompts and checked-in snapshots as the old-version baseline. Configure two providers through these environment variables, then run `node scripts/eval-prompts.mjs --run-models --record`:

- `TASKWEAVER_PROMPT_EVAL_A_BASE_URL`, `TASKWEAVER_PROMPT_EVAL_A_MODEL`, `TASKWEAVER_PROMPT_EVAL_A_API_KEY`
- `TASKWEAVER_PROMPT_EVAL_B_BASE_URL`, `TASKWEAVER_PROMPT_EVAL_B_MODEL`, `TASKWEAVER_PROMPT_EVAL_B_API_KEY`

The base URL should be an OpenAI-compatible API root, such as a URL ending in `/v1`. Results are saved under `eval/prompts/`. The evaluator reports pass rate, mean provider-reported tokens, and cache-read rate when the provider returns cache usage. Text-only chat completions cannot prove that a file mutation or verification command actually ran; that acceptance criterion still needs an agent runtime tool-event trace.
