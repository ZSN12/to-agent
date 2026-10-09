# Agent Note: Workspace semantic search and inline editing

Status: implemented

English | [中文](2026-10-09-workspace-semantic-search-inline-edit.zh.md)

## Problem

The filesystem search and inline edit packages were absent from the built Host and coding presets, so their model-facing tools could not be used through TaskWeaver. Their experimental implementations also bypassed the Host filesystem service, which meant indexing and edits did not share the filesystem workspace and mutation policies.

## Decision

The standard and TaskWeaver code presets mount both packages; the read-only preset does not mount inline editing. Inline editing resolves, reads, observes, and edits through `ctx.fs`, uses atomic `editText` with the shared edit-intent and sandbox-escalation policy, and returns the common contextual diff presentation. A preview is informational and does not reserve file state.

Semantic indexing resolves the session workspace through `ctx.fs`, refuses paths outside it, follows only listed regular files contained by the selected root, skips dependency and generated directories, and observes file-count and byte caps. The index and vector store are scoped per resolved workspace. Jina or OpenAI credentials come from plugin configuration or the Host environment and are used only when a model calls an index or search tool. The default vector store is in-memory; ChromaDB remains optional.

Both packages are Host build and TypeScript aggregate dependencies and direct CLI runtime dependencies. The filesystem tool package exports its sandbox controller, session path resolver, and diff formatter from its package entrypoint for sibling filesystem tools.

## Alternatives considered

- **Keep the plugins source-only until later.** This preserves dormant code but leaves the requested capabilities unavailable to the shipped TaskWeaver composition.
- **Read and write with Node filesystem APIs inside each plugin.** This bypasses the Host filesystem provider and its workspace and mutation policies, so remote and sandbox deployments behave differently.
- **Index automatically at Host startup.** This consumes credentials, network, and indexing time before a user asks for search; explicit tool calls keep those effects user-triggered.

## Consequences

The standard and TaskWeaver code presets expose semantic indexing/search and inline diff editing through the Host tool registry. Search requires an embedding credential and network availability; the default in-memory index disappears when the Host exits. The code chunker remains pattern-based and can miss unusual syntax. Preview data can become stale before apply, so the apply path relies on the existing observed-version guard and requires rereading after a stale refusal.

Package builds, Host composition loading, sandbox-denial behavior, and real embedding-provider calls still need an integration verification pass.
