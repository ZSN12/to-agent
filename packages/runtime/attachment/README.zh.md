# attachment 包族

<a id="family-attachment"></a>
[返回 TaskWeaver Runtime 包族目录](../README.zh.md#runtime-family-index)

## 职责与边界

定义二进制附件的身份、校验和持久化边界，并提供本地内容寻址存储实现。

本页汇总当前目录下的包清单，并集中保存原逐包文档中的 API、扩展点、错误语义和限制。包名、包目录和导出面保持原样。

## 包清单

| 包名 | 目录 | 详细说明 |
|---|---|---|
| [`@taskweaver/dsh-attachment`](#pkg-taskweaver-dsh-attachment) | `attachment/attachment` | [接口与限制](#pkg-taskweaver-dsh-attachment) |
| [`@taskweaver/dsh-attachment-local`](#pkg-taskweaver-dsh-attachment-local) | `attachment/attachment-local` | [接口与限制](#pkg-taskweaver-dsh-attachment-local) |

## API、扩展点与限制

以下内容从原逐包 README 和族级 README 迁入。为了保留接口名、代码片段、错误文本与约束语义，技术细节按原文保存；本页前半部分提供中文目录和边界说明。

<a id="pkg-taskweaver-dsh-attachment"></a>
### `@taskweaver/dsh-attachment`

<!-- migrated-from: packages/runtime/attachment/attachment/README.md -->
目录：`attachment/attachment`。
package.json 描述：Durable immutable attachment storage seam for the DeepSeek Harness

<a id="pkg-taskweaver-dsh-attachment--taskweaver-dsh-attachment"></a>
The durable attachment seam. `ctx.attachments` validates and durably commits a provider-independent normalized image, then returns a serializable `ImageAttachmentRef`; consumers never persist browser paths, object URLs, provider URLs, or base64 in session events.

Unsent composer images remain browser-owned temporary drafts. `validateImage` runs the complete admission policy without persisting. `saveImages` owns batch count and aggregate-byte limits, prepares every normalized attachment before publishing any member, then commits in order and returns references only after the complete batch succeeds. A later storage failure returns no partial references, although an earlier immutable content-addressed object may remain unreachable until reference-aware garbage collection exists. `AttachmentError.code` uses the closed `AttachmentErrorCode` string union. Its `ImageAdmissionErrorCode` subset marks caller-correctable image-input failures; `isImageAdmissionError` recognizes that subset at runtime so each protocol adapter can map its own error vocabulary. `saveImage` commits one accepted image before any model-visible session event is published and returns its `ImageAttachmentRef`. When normalization reduces the raster, the reference records the orientation-applied input size in `originalDimensions`. `readImage` verifies the normalized attachment against its logged metadata. `readImageRequest` deterministically derives a route-sized request version whose identity covers the attachment id, transform version, pixel and byte budgets, and encoder settings. Callers compose ordered batches with `Promise.all(refs.map(...))`; the local implementation still bounds compression through its instance limiter, cache, and singleflight. Callers may cancel reads and projections; implementations preserve cancellation instead of translating it into a storage failure.

`admitEncodedImages(attachments, images)` is the shared wire entry used by every RPC endpoint that accepts browser uploads (the session prompt endpoint and the command executor): it enforces canonical base64 on every member, then delegates batch admission — limits, validation, ordered commit — to `saveImages`. The base64 upload form is `EncodedImageAttachment`, exported from `@taskweaver/dsh-attachment/types` so wire contracts can reference it.

<a id="pkg-taskweaver-dsh-attachment--model-experience"></a>
#### Model Experience

Indirectly, through the role-neutral core `ImageBlock` and provider adapters that resolve its durable reference into an exact request version. Request descriptors expose the complete attachment id and actual request dimensions.

<a id="pkg-taskweaver-dsh-attachment--kv-cache-effect"></a>
###### KV Cache effect

Adding an image changes the provider request and therefore invalidates the affected request suffix.

<a id="pkg-taskweaver-dsh-attachment--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Version one accepts PNG, JPEG, WebP, and GIF only.
- Retention and garbage collection are deferred because resumed and forked sessions may share immutable objects.
- Generic files, audio, video, and persistent unsent drafts require separate lifecycle and provider contracts.

<a id="pkg-taskweaver-dsh-attachment-local"></a>
### `@taskweaver/dsh-attachment-local`

<!-- migrated-from: packages/runtime/attachment/attachment-local/README.md -->
目录：`attachment/attachment-local`。
package.json 描述：Private content-addressed TASKWEAVER_HOME attachment storage

<a id="pkg-taskweaver-dsh-attachment-local--taskweaver-dsh-attachment-local"></a>
The private local implementation of [`@taskweaver/dsh-attachment`](./attachment). Objects land at `<TASKWEAVER_HOME>/attachments/v1/objects/<sha256-prefix>/<sha256>` and are addressed by an opaque `sha256:` id. Each process proves a home durable once by syncing every ancestor entry to the filesystem root. Writes use a private staging directory, owner-only files, a synced temporary file, an atomic exclusive hard-link publish, and directory syncs on the publication path (POSIX; Windows relies on filesystem metadata journaling) so the reported reference survives a crash.

Admission accepts at most 20 images and 200MiB of encoded source bytes per message. Each source may use up to 20MiB, 64,000,000 pixels, and 8192px per side. It then prepares a provider-independent normalized attachment. EXIF orientation is applied, metadata and color profiles are removed, pixels become 8-bit sRGB/sRGBA, and the long edge is reduced proportionally to `normalizedImageMaxDimension` (2048px by default). The normalized attachment has its own `normalizedImageMaxBytes` safety cap (4MiB by default). Transparent pixels are retained; Sharp/libvips may omit an alpha plane whose samples are all opaque. A nearest-neighbour bounded sample classifies color complexity without averaging high-frequency pixels. Confirmed low-color images try PNG, using a palette only when the input has no alpha channel, then WebP at qualities 85, 80, and 75. Other alpha images try WebP at those qualities; other opaque images try JPEG. Each candidate runs only after the preceding candidate exceeds the cap. Dimensions shrink only after every candidate at one size exceeds the cap. A clean, single-frame 8-bit sRGB/sRGBA PNG, JPEG, or WebP already within both normalization limits passes through byte-identically; 16-bit PNG, GIF, animated input, metadata, orientation, and incompatible color spaces force conversion. The source and converted attachment are each fully decoded once. `saveImages` prepares and verifies every normalized attachment once before publishing the batch, so validation failure leaves no partial references and commit does not repeat full image encoding.

Request versions live below `<TASKWEAVER_HOME>/attachments/v1/request-images/`. `readImageRequest` scales the stored normalized attachment under a total-pixel budget without enlargement, then enforces a separate encoded-byte cap. The request encoder uses the same color branches, with PNG (palette only without alpha) before WebP 85 and 80 for low-color images, WebP 85 then 80 for other alpha images, and JPEG 85 then 80 for other opaque images. It executes candidates lazily and reduces dimensions only after both quality attempts exceed the request cap. Its cache identity includes the attachment id, transform version, pixel and byte budgets, and fixed encoder settings. Cached bytes are fully decoded and checked as 8-bit sRGB/sRGBA before use. Concurrent calls for one identity share one transform and cache write; cancelling one waiter does not cancel the shared work. Callers compose ordered batches from singular reads, while the service's FIFO limiter applies `imageCompressionConcurrency` to simultaneous normalization and request transforms. The setting ranges from 1 through 8 and defaults to 2; file publication remains ordered after preparation.

`TASKWEAVER_HOME` resolves through the shared path policy: explicit config, `$TASKWEAVER_HOME`, then `~/.taskweaver/runtime`. Session logs contain only the reference and verified metadata, never this host path. `readImage` forwards optional cancellation into the filesystem read, observes it around verification, and preserves it instead of wrapping it as `ATTACHMENT_READ_FAILED`.

<a id="pkg-taskweaver-dsh-attachment-local--model-experience"></a>
#### Model Experience

Indirectly, through durable replay of historical user images and structured model image output after restart and fork.

<a id="pkg-taskweaver-dsh-attachment-local--kv-cache-effect"></a>
###### KV Cache effect

Normalization and request projection are deterministic. An unchanged attachment and route policy reuse identical cached request bytes on later turns.

<a id="pkg-taskweaver-dsh-attachment-local--known-limitations-and-deferred-work"></a>
#### Known Limitations and Deferred Work

- Objects are retained indefinitely; reference-aware garbage collection is deferred.
- The local backend assumes the host and provider adapter share this filesystem service.
- Animated GIF sources keep only their first frame; animation is outside the version-one image contract.
- The normalization and request encoders are pinned by the installed sharp/libvips build; an encoder or transform-version upgrade re-addresses future normalized attachments or request variants while existing objects stay valid.

<a id="family-attachment"></a>
### 原族级说明（迁移保留）

<a id="family-attachment--attachment-durable-attachment-capability-family"></a>
The durable binary attachment seam and its local filesystem implementation. Both are product packages.

| Package | Role | ctx key |
|---|---|---|
| `attachment/` | Immutable attachment references, image limits, and storage service | `ctx.attachments` |
| `attachment-local/` | Content-addressed private storage below `TASKWEAVER_HOME` | (registers on `ctx.attachments`) |

Unsent browser drafts are intentionally outside this capability. Bytes enter durable storage only when a user prompt is submitted or when a provider adapter commits structured model output.
