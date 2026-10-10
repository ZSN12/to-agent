# credentials 包族

<a id="family-credentials"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

分离凭据引用、凭据提供者和授权流程。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-authorization`](#pkg-taskweaver-dsh-authorization) | `credentials/authorization` | [接口与限制](#pkg-taskweaver-dsh-authorization) |
| [`@taskweaver/dsh-credentials`](#pkg-taskweaver-dsh-credentials) | `credentials/credentials` | [接口与限制](#pkg-taskweaver-dsh-credentials) |
| [`@taskweaver/dsh-credentials-local`](#pkg-taskweaver-dsh-credentials-local) | `credentials/credentials-local` | [接口与限制](#pkg-taskweaver-dsh-credentials-local) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-authorization"></a>
### `@taskweaver/dsh-authorization`

<!-- migrated-from: packages/runtime/credentials/authorization/README.md -->
目录：`credentials/authorization`。
package.json 描述：Authorization seam (ctx.authorization): plugin-owned flows that obtain a credential through a conversation with the human

<a id="pkg-taskweaver-dsh-authorization--dsh-authorization"></a>
Authorization Service Definition (`ctx.authorization`). Some credentials cannot be configured, only obtained: getting one means a conversation with a human — open this page, paste that code, pick an account. This seam owns that conversation and the lifecycle around it, and never the protocol.

**A flow is a plugin's knowledge of how to get its own credential.** It is registered under the [`CredentialKey`](./README.zh.md#pkg-taskweaver-dsh-credentials--two-key-spaces-two-questions) it writes, so a flow says which record it produces and, through that key's scope, which plugin answers for the format inside it. A second authorization protocol arrives as another flow, not as another seam.

**The flow owns the write.** `run()` resolving means the record is already committed through `ctx.credentials`; the seam confirms a commit it observed during the attempt — presence alone would let a re-authorization pass a stale record off as fresh — and refuses a flow that resolved without one. Committing inside the flow is what lets a library that persists through its own store adapter stay the single writer instead of being copied back out and written twice.

**The interaction travels with the request, not a registry.** Whoever starts an authorization is the one who can talk to the human about it, so prompts reach exactly the surface that asked and a headless caller supplies an interaction that declines. There is no ambient provider to be absent, and no question about which of two open pages a prompt belongs to.

<a id="pkg-taskweaver-dsh-authorization--surface"></a>
#### Surface

```ts
import type { Context } from '@taskweaver/cordis'
import { AuthorizationDeclinedError, type AuthorizationSession } from '@taskweaver/dsh-authorization'
import { credentialKey } from '@taskweaver/dsh-credentials'

declare const ctx: Context
declare const exchange: (signal: AbortSignal) => Promise<void>

const key = credentialKey('llm-pi-ai', 'openai-codex')

const dispose = ctx.authorization.registerFlow({
  key,
  label: 'ChatGPT (Codex)',
  methods: [{ id: 'oauth', label: 'Sign in with ChatGPT' }],
  async run(session: AuthorizationSession) {
    session.notify({ message: 'Continue in your browser', url: 'https://auth.example/start' })
    const code = await session.prompt({ kind: 'text', message: 'Paste the code' })
    // Commits the record through ctx.credentials before resolving.
    await exchange(session.signal)
    void code
  },
})

ctx.authorization.list()                    // [{ key, label, methods, inFlight }]
ctx.authorization.describe(key)             // the same entry, or undefined
await ctx.authorization.begin({             // { status: 'authorized' | 'cancelled' }
  key,
  interaction: { notify: () => {}, prompt: () => Promise.reject(new AuthorizationDeclinedError()) },
})
ctx.authorization.cancel(key)               // withdraw whatever is running for the key
dispose()
```

One attempt per key at a time. A second caller is refused with `ALREADY_IN_FLIGHT` rather than joined, because the two would be prompting different humans through one flow and the second would be answering questions the first was asked. `inFlight` is on the entry so a surface renders the button disabled instead of discovering this by error.

`cancel(key)` exists beside the request's own signal because a request/response transport answers a Cancel button on a second call, holding no handle on the first one's signal. A flow whose registration is disposed mid-attempt is withdrawn the same way: its runner belongs to a plugin that is going away.

An attempt whose caller has already withdrawn never claims the key and never starts the flow — relying on each flow to check its signal before the first await would let one that does not hang holding the key. Validation still runs first, so a caller naming a key or method that does not exist hears about it whether or not it also gave up.

A human's "no" is an outcome, not a breakage. An interaction that declines rejects its prompt with `AuthorizationDeclinedError`, and an attempt that fails after a declined prompt settles as `cancelled`, exactly as a withdrawn signal does; any other prompt rejection stays a flow failure that reaches the caller. A notice is fire-and-forget on the same principle, held at the seam: a surface that cannot render one loses the notice, never the attempt.

`authorization/settled (key, settlement)` fires after the key is released, for every terminal outcome. `settlement` adds `failed` to the two statuses `begin()` can return: a failure reaches its own caller as a thrown error, so the event stream is the only place a watcher that did not start the attempt can tell a refusal from a breakage. Listener failures are contained: every listener runs, a throw or rejection is logged without changing the finished attempt's outcome, and only an `INVARIANT`-coded failure rethrows after the rest ran.

<a id="pkg-taskweaver-dsh-authorization--the-interaction-vocabulary"></a>
#### The interaction vocabulary

A notice is one-way and never carries a secret: a message, optionally the page the human must open and the code they must enter there. A prompt is a question the flow cannot answer — `text`, `secret`, or `select` — and `secret` differs from `text` only in presentation. A prompt carries its own `signal` so a flow that races a typed code against a browser callback can withdraw the losing question while the attempt continues; the request's signal withdraws the whole attempt instead.

The vocabulary is deliberately smaller than any one provider's: it describes what a surface must render, so a surface that renders one flow renders all of them.

<a id="pkg-taskweaver-dsh-authorization--model-experience"></a>
#### Model Experience

None, as authorization is a configuration-time conversation with a human and no flow, notice, or prompt reaches a model request.

<a id="pkg-taskweaver-dsh-authorization--kv-cache-effect"></a>
###### KV Cache effect

No invalidation; no authorization state enters a request prefix.

<a id="pkg-taskweaver-dsh-authorization--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **No flow is resumable** — an attempt lives in the process that started it, so a browser reload during a login abandons it and the human starts over. Durable attempts need a store this seam does not have.
- **Nothing revokes** — signing out is `ctx.credentials.deleteRecord(key)`, which forgets the local record without telling the issuer. A provider that needs a server-side revoke has no place to declare it yet.
- **A key with no flow is inert** — the seam reports what is registered, so a record left by an uninstalled plugin can be deleted but not re-authorized. Recognizing that orphan is the caller's join, as it is for [`listRecords()`](./README.zh.md#pkg-taskweaver-dsh-credentials--surface).

<a id="pkg-taskweaver-dsh-credentials"></a>
### `@taskweaver/dsh-credentials`

<!-- migrated-from: packages/runtime/credentials/credentials/README.md -->
目录：`credentials/credentials`。
package.json 描述：Abstract credential seam (ctx.credentials): settings carry references to secrets, providers own the values

<a id="pkg-taskweaver-dsh-credentials--dsh-credentials"></a>
Credential Service Definition (`ctx.credentials`). One doctrine, three consequences:

**Configuration carries references to secrets, never the secrets.** A settings section or `cordis.yml` entry says `apiKeyEnv: DEEPSEEK_API_KEY`; the value behind that reference lives with a credential provider. So the settings document stays safe to sync and to render in a configuration UI, `describe()` can answer "is this configured, where from, can I write it" without ever holding a value, and rotating a secret touches no configuration file.

**Consumers resolve per operation.** `resolve(ref)` is called at the start of each operation (the LLM adapters resolve once per model request) and never cached across operations — that read is what makes a changed credential reach the very next request without restarting any plugin.

**An empty stored value is absent.** Everywhere: `resolve` skips it, `describe` reports it unconfigured. A blank can never masquerade as a configured secret.

<a id="pkg-taskweaver-dsh-credentials--two-key-spaces-two-questions"></a>
#### Two key spaces, two questions

A `CredentialRef` answers *what is behind this environment-variable name*, layered over the process environment, the managed store, and `.env` files. Everything above describes that half.

A `CredentialKey` answers *what credential does this plugin hold for this id*. Nothing can layer here — an authorization grant has no environment to be read from — so presence of the record is the whole fact, and the empty-value rule does not apply: an `api-key` record carrying neither a key nor environment values states that its owner confirmed ambient authentication, which is configured.

The key is `<scope>/<id>`, where `scope` is the **owning plugin's registered name**. The scope is the owner rather than the domain because a `grant` payload is written in its owner's format: two plugins serving the same provider name would otherwise read each other's payload, and a record left behind by an uninstalled plugin could not be told apart from a live one. The `/` also keeps the two grammars disjoint, so the key spaces can never collide. A consumer whose id arrives from somewhere else — a settings dict key, a library's own provider id — asks `isCredentialKeySegment` before building a key, because an id outside the grammar can never have stored a record and should read as "nothing stored" rather than throw on the address.

<a id="pkg-taskweaver-dsh-credentials--surface"></a>
#### Surface

```ts
import type { Context } from '@taskweaver/cordis'
import { credentialKey, credentialRef } from '@taskweaver/dsh-credentials'

declare const ctx: Context

const ref = credentialRef('DEEPSEEK_API_KEY')            // POSIX shell identifier, branded
const hit = await ctx.credentials.resolve(ref)           // { value, source } | undefined
const info = await ctx.credentials.describe(ref)         // { configured, source?, writable } — never the value
await ctx.credentials.set(ref, 'sk-…')                   // rejects while a read-only source shadows the ref
await ctx.credentials.unset(ref)                         // no-op when absent; same shadowing rule

const key = credentialKey('llm-pi-ai', 'openai-codex')   // <owner>/<id>, branded
await ctx.credentials.readRecord(key)                    // CredentialRecord | undefined
await ctx.credentials.describeRecord(key)                // { configured, kind?, writable } — never the value
await ctx.credentials.listRecords()                      // [{ key, kind }] — never values
await ctx.credentials.modifyRecord(key, async () => ({ kind: 'grant', payload: { token: '…' } }))
await ctx.credentials.deleteRecord(key)                  // no-op when absent
```

`modifyRecord` is the only write path because a correct write depends on the current value: a token refresh is read-decide-replace, and the mutation must see the record as it stands at the moment the write is exclusive. Exclusion holds across processes, which is what stops two of them rotating one refresh token and losing whichever wrote first. Returning `undefined` from the mutation leaves the entry untouched and announces nothing.

`listRecords` exists even though the reference half has no enumeration by design. References are discovered from settings schemas (`apiKeyEnv` fields); records have no such path, so a surface that cannot list them cannot show what a user is authorized for, nor find an orphan left by an uninstalled plugin.

A `grant` record's `payload` is opaque: the seam never reads, validates, or reshapes it. The one constraint is that it survives a JSON round trip, which the provider enforces on the way in and on the way out — a value the store could not read back exactly as written is refused rather than stored lossily.

`credentials/reference-updated (ref)` fires after a committed change to a provider-managed source — a `set`, an `unset`, or an external edit observed in storage. Ambient process-environment changes are not observable and never emit. Consumers do not need the event (they re-resolve per operation); it exists for configuration UIs refreshing a "configured" badge. Its declaration lives in the client-safe `./types` subpath export together with the `CredentialRef` type it names (the package root re-exports the type), so a consumer outside the Host compilation face reads the very signature the Host emits instead of restating it.

The shadowing rule on `set`/`unset` is deliberate fail-loud: when a read-only source (the live process environment, in the local provider) currently supplies the reference, a write would appear to succeed while resolution keeps returning the shadowing value — the seam rejects instead, and `describe().writable` lets a UI render the reference read-only up front.

<a id="pkg-taskweaver-dsh-credentials--providers"></a>
#### Providers

[`dsh-credentials-local`](./README.zh.md#pkg-taskweaver-dsh-credentials-local) layers the inherited process environment over its managed `$TASKWEAVER_HOME/.credentials.yaml` document, with the launcher's project and user `.env` layers as fallbacks. The seam shape leaves room for keyring-, helper-command-, and KMS-backed providers; a remote settings provider never needs to carry secrets.

<a id="pkg-taskweaver-dsh-credentials--model-experience"></a>
#### Model Experience

Indirectly, through the consuming LLM adapters: a resolved value authorizes their provider requests, and the adapter owns every model-visible surface.

<a id="pkg-taskweaver-dsh-credentials--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; credentials never enter a request prefix.

<a id="pkg-taskweaver-dsh-credentials--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **References have no enumeration** — the seam answers questions about references it is given; configuration surfaces learn them from settings schemas, so a `list()` over that half has no current consumer. Records do enumerate, for the reason above.
- **References are environment-variable-shaped** — one flat POSIX-identifier namespace, because a reference doubles as the environment name it resolves through. Records carry the richer `<owner>/<id>` addressing.
- **Process-environment changes are invisible** — no event can fire for them; a UI only re-reads `describe()` on its own navigation.
- **A record's owner is its scope, and nothing verifies the scope is mounted** — the seam stores what it is given and reports what it stores. Recognizing an orphan is the caller's join between `listRecords()` and whatever registry owns that scope; the seam has no registry of its own to check against.

<a id="pkg-taskweaver-dsh-credentials-local"></a>
### `@taskweaver/dsh-credentials-local`

<!-- migrated-from: packages/runtime/credentials/credentials-local/README.md -->
目录：`credentials/credentials-local`。
package.json 描述：File-backed credentials provider ($TASKWEAVER_HOME/.env under the live process environment) for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-credentials-local--dsh-credentials-local"></a>
File-backed [credentials](./README.zh.md#pkg-taskweaver-dsh-credentials) provider: four layers, one honest precedence.

| Layer | Source id | Writable | Wins |
|---|---|---|---|
| Inherited process environment | `env` | no | always |
| `$TASKWEAVER_HOME/.credentials.yaml` document | `file` | yes (`set`/`unset`) | over both `.env` layers |
| `<invocation cwd>/.env` | `project-env` | not here | over the user `.env` |
| `$TASKWEAVER_HOME/.env` | `user-env` | not here | otherwise |

The launching environment wins because a per-run override (`DEEPSEEK_API_KEY=… dsh`, a CI secret, a container `-e`) is operator intent for this run — and because it cannot be edited from inside, it must be *visibly* read-only: `describe()` reports `source: 'env', writable: false`, and `set`/`unset` reject instead of writing a change the reader would never see.

Everything below it loses to the managed store, so a key written by the Models page takes effect immediately even when an older key sits in a `.env`. Those two layers still resolve when nothing is stored, and `describe()` names them `project-env` or `user-env` with `writable: true` — storing a key replaces them as the effective source.

Under the product CLI, resolution reads the launcher's frozen [environment snapshot](../util/README.zh.md#pkg-taskweaver-dsh-launch-environment) rather than `process.env`: only the snapshot can say whether a value came from the launching shell or from a file. A composition the product CLI did not boot has the inherited environment as its only layer, which keeps embedders on the semantics they already had.

<a id="pkg-taskweaver-dsh-credentials-local--config"></a>
#### Config

| Field | Default | Meaning |
|---|---|---|
| `path` | `<harness home>/.credentials.yaml` | Credentials document location. |
| `dshHome` | `$TASKWEAVER_HOME` or `~/.taskweaver/runtime` | Runtime home used when `path` is omitted. |
| `watch` | `true` | Hot-publish external edits. |
| `debounceMs` | `100` | Watcher write-settle window. |

<a id="pkg-taskweaver-dsh-credentials-local--the-document"></a>
#### The document

A versioned YAML document with one section per key space, and nothing else:

```yaml
version: 1

refs:
  DEEPSEEK_API_KEY: sk-…
  OPENAI_API_KEY: sk-…

records:
  llm-pi-ai/openai-codex:
    kind: grant
    payload:                    # written verbatim; this provider does not interpret it
      type: oauth
      access: eyJhbGciOi…
      refresh: rft_9f8e7d…
      expires: 1786000000000
  llm-pi-ai/amazon-bedrock:
    kind: api-key               # environment values, no key: this route uses an AWS profile
    env:
      AWS_PROFILE: prod
  llm-pi-ai/amazon-bedrock-dev:
    kind: api-key               # neither: the owner confirmed the ambient credential chain
```

The document holds credentials only, so every deviation is a rejection rather than a skipped entry — a silently ignored key would read as "the credential I stored has no effect". A non-mapping root, an unknown top-level key, a key that is not addressable in its space, a wrong-typed value, an empty string, an unknown record tag or field, a duplicate key, and malformed YAML all fail: loud at boot, and warn-and-keep-the-last-good-snapshot on a live reload.

A `grant` payload must survive a JSON round trip, enforced in both directions. YAML spells values JSON has none for — `.inf`, alias cycles — and an owner may hand over a `Date` or a `bigint`; either way the store refuses rather than saving something it could not read back exactly as written.

The pre-release layout was a flat mapping with no `version`. A boot that recognizes it exactly — addressable names over non-empty string scalars, no directives — upgrades the document in place under the writer lock: the original lines nest verbatim under `refs:`, so values, comments, and spellings survive byte for byte. Any other flat shape is refused by name, with the entry count and the one edit needed (`version: 1`, nest under `refs:`) — never read as an empty store, which would surface as an authentication failure on the first request instead of at load. A live reload never migrates: a flat document restored mid-run keeps the last good snapshot until the next boot.

Writes patch the parsed document rather than rebuilding it, so comments and the formatting of every untouched entry survive. A comment directly above an entry is that entry's annotation and is removed with it. Every write first re-reads the document under the cross-process writer lock of [`dsh-atomic-write`](../util/README.zh.md#pkg-taskweaver-dsh-atomic-write) and publishes anything it had not observed, then commits atomically with mode `0600` under an owner-only (`0700`) directory — so a concurrent writer or an external edit inside the watcher's debounce window is folded in rather than overwritten. An on-disk document that no longer parses fails the write instead of overwriting content the provider could not understand.

Any string value round-trips, multi-line values included, so no entry is unwritable for want of a quoting style. An empty stored value is absent, per the seam rule — which is why an empty string in the document is rejected outright: `unset` removes a key, it does not blank it.

<a id="pkg-taskweaver-dsh-credentials-local--permissions"></a>
#### Permissions

The provider creates the directory `0700` and creates or atomically replaces the document `0600`. It holds what it *reads* to that same bound: on POSIX a document carrying any group or other permission bit fails before its contents are parsed — at boot and on every reload — and the error names the `chmod 600` repair. Windows has no mode to inspect, so the check is skipped there rather than faked.

<a id="pkg-taskweaver-dsh-credentials-local--hot-reload"></a>
#### Hot reload

External edits publish `credentials/reference-updated` per changed reference after the snapshot is replaced **wholesale** — an entry deleted on disk never lingers in memory. Before Chokidar opens the target, the provider realpaths its deepest existing ancestor and restores any missing suffix; file access and diagnostics retain the configured path, while Windows cannot mix an 8.3 alias with long-form libuv events. The provider's own writes are recognized by content and publish exactly their one commit event. An unreadable or invalid document at runtime keeps the last good snapshot and warns; an absent file is an empty store; an unreadable or invalid file at boot fails loud.

<a id="pkg-taskweaver-dsh-credentials-local--security-boundary"></a>
#### Security boundary

The document is `0600` under a `0700` directory, which stops other OS users — **not** the model. Tool processes (bash, the filesystem tools) run as the same user, and the shipped `workspace-write` file policy confines mutations rather than reads, so they can read this file exactly like any other file the user owns; no sandbox mode singles it out. What the harness does hold to is narrower: it never hands the model a resolved path to the document, and never loads it into the process environment — unlike `$TASKWEAVER_HOME/.env`, which is the user's ordinary environment layer (see [app-boot's Harness-home layers](../boot/README.zh.md#pkg-taskweaver-dsh-app-boot--profiles)) — so reaching the value takes a deliberate read of a path the agent was not given.

That is discretion, not a boundary. A deployment that must keep provider keys away from its own agent cannot get there with file permissions; an OS-keychain provider — a store the model's processes cannot read at all — is the deferred answer and belongs beside this provider as a sibling package.

<a id="pkg-taskweaver-dsh-credentials-local--model-experience"></a>
#### Model Experience

Indirectly, through the consuming LLM adapters: stored values authorize their provider requests, and the adapter owns every model-visible surface.

<a id="pkg-taskweaver-dsh-credentials-local--kv-cache-effect"></a>
###### KV Cache effect

No direct invalidation; credentials never enter a request prefix.

<a id="pkg-taskweaver-dsh-credentials-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- **Same-reference concurrent writes are last-write-wins** — the writer lock and the read-modify-write keep concurrent writers from dropping each other's entries, but two writers editing one reference still resolve to the later write; there is no revision check.
- **A same-UID process can read the document** — see [Security boundary](README.zh.md#pkg-taskweaver-dsh-credentials-local--security-boundary): the file-effect sandbox modes do not deny reads, and an OS-keychain provider is deferred.
- **Environment changes are invisible** — the snapshot is frozen at launch, so a variable exported after startup reaches neither resolution nor `describe`; changing an environment-sourced credential takes a restart.
- **Atomic, not crash-durable** — inherited from `dsh-atomic-write`; the store re-reads on boot.

<a id="family-credentials"></a>
### 原族级说明（迁移保留）

<a id="family-credentials--credentials-credentials-and-authorization"></a>
The credential capability family separates reference resolution from its provider, and separates both from obtaining a credential that has to be asked for:

| Package | Role | ctx key |
|---|---|---|
| [`credentials/`](./README.zh.md#pkg-taskweaver-dsh-credentials) | Credential-reference and credential-record seam | `ctx.credentials` |
| [`credentials-local/`](./README.zh.md#pkg-taskweaver-dsh-credentials-local) | Environment and local-file provider | registers `ctx.credentials` |
| [`authorization/`](./README.zh.md#pkg-taskweaver-dsh-authorization) | Plugin-owned flows that obtain a credential by asking a human | `ctx.authorization` |

Configuration carries references, not secret values. Consumers resolve those references at their operation boundary; the child READMEs own mutation, precedence, and storage semantics. An authorization flow writes a credential record and is keyed by it, so the two seams meet at the record and nowhere else.

The subsystem reference — `CredentialRef`, per-operation resolution, UI-safe `CredentialInfo`, provider layers — is [docs/subsystems/credentials.md]（原文链接目标：`../../docs/subsystems/credentials.md`）.
