# Reproducible performance evidence

The measurements in this directory are deterministic, same-machine microbenchmarks for the implementations used by TaskWeaver. They are not end-to-end LLM quality results, and latency should only be compared on the same machine and runtime.

## Reproduce

Run from the repository root with Node.js 22:

```sh
node scripts/benchmark-dag-scalability.mjs --output docs/benchmark-results/dag-scalability-YYYY-MM-DD.json
node scripts/benchmark-semantic-topk.mjs --output docs/benchmark-results/semantic-topk-YYYY-MM-DD.json
node scripts/render-benchmark-figures.mjs --dag docs/benchmark-results/dag-scalability-YYYY-MM-DD.json --semantic docs/benchmark-results/semantic-topk-YYYY-MM-DD.json
```

Each benchmark writes a JSON report and a neighboring CSV. The figure script reads those reports and writes SVG charts under `docs/benchmark-results/figures/`.

## DAG algorithm comparison

The standalone DAG benchmark compares repeated full-graph scans with the production `IncrementalReadyQueue`, and repeated DFS reachability with the production `Uint8Array` transitive closure. It uses fixed-seed graphs of 5, 15, 30, and 50 nodes, checks that scheduling order and reachability results match, and reports the closure matrix's exact byte count.

The 15/30/50-node cases intentionally bypass the production DAG request validator to examine algorithm scaling only. The application limit remains 12 nodes. The report does not measure RSS or JavaScript object overhead, and it does not represent real model-task makespan.

## Semantic Top-K comparison

The semantic benchmark invokes the production `InMemoryVectorStore.search` over deterministic, normalized 64-dimensional vectors at 1k, 5k, 10k, 25k, and 50k chunks. The reference computes the same cosine scores and sorts every scored result. Every result ID and score is checked before timing. Index construction is reported separately; query timing excludes model embedding and network latency.

The working-set chart reports the number of score entries retained during selection (N for full sort, min(N, K) for the heap), not measured process memory. The numeric vector payload is reported separately in JSON/CSV and excludes JavaScript array/object overhead.

## Current artifacts

- `dag-scalability-2026-10-26.json` / `.csv`: 5–50 node scheduling and reachability comparison.
- `semantic-topk-2026-10-26.json` / `.csv`: 1k–50k chunk MinHeap Top-K comparison.
- `figures/dag-scalability.svg`: DAG latency and exact bitmap-size plots.
- `figures/semantic-topk.svg`: semantic retrieval latency and selection working-set plots.
- `dag-performance-2026-10-26.json`: current production DAG latency at the supported 3/6/12 node sizes.
- `semantic-search-2026-10-26.json`: BM25 candidate-scoring cache comparison; this is distinct from the vector Top-K experiment.
- `context-hot-paths-2026-10-26.json`: token estimate, Repo Map budget-fitting, and PageRank microbenchmarks.
