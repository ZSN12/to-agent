# @z/dsh-session-log-export

This package registers the Host `/export` command for Session-log downloads. It owns no browser slot, button, dialog, or client bundle. The ZIP stream and `GET /api/session.export?sessionId=<id>&includeDescendants=true` endpoint remain owned by `dsh-host-apiproxy`.

## Command contract

| Input | Result |
|---|---|
| `/export` | Returns a successful `Session log download requested.` command result. |
| `/export <path>` | Returns an error because the Host command does not accept a filesystem path. |

The command is registered in the command plane and is excluded from model history. Package tests verify command registration, execution, and disposal through a direct Cordis context and a real Loader composition.

## Composition

```yaml
- id: session-log-download
  name: '@z/dsh-session-log-export'
```

Compose it with `dsh-commands` and `dsh-host-apiproxy`. The package contributes only the Host command. The Host endpoint flushes a live root Session before reading its persisted event artifact, then streams the ZIP without buffering it in the Host command package.

## Model experience

The command is a human control, creates no model turn, and has no token or KV-cache effect.

## Limitations

- Export requires a persistence backend that exposes a raw Session artifact. The shipped JSONL backend supports plaintext and zstd artifacts; SQLite export is not included.
- The command does not write to a Host path. It reports that a download was requested; transport and destination handling belong to the endpoint consumer.
- Errors discovered after ZIP streaming begins are handled by the HTTP consumer.
