# `@z/dsh`

The `dsh` command boots a named profile: an ordered stack of plugin-bundle patch layers under the user's own overrides. [`src/args.ts`](src/args.ts) parses launcher flags and forwards remaining arguments to the selected profile. [`src/bin.ts`](src/bin.ts) loads only the requested runner.

## Commands

| Command | Purpose |
|---|---|
| `dsh --profile <name>` | Boot an installed profile under `$DSH_HOME/profiles/<name>`. |
| `dsh --profile <name> --patch <path>` | Apply an additional patch overlay after the profile layers. Repeatable. |
| `dsh --profile <name> --dump-config` | Print the composed profile tree and exit. |
| `dsh --profile <name> --dump-default-config` | Print bundle layers without user overlays and exit. |
| `dsh plugin --profile <name> <pnpm args>` | Manage a profile's plugin dependencies and bundle layers. |

The invoking directory is the default workspace root. Launcher flags come first; once the launcher reaches an unknown option or positional argument, the rest belongs to the profile's app. Use `dsh --help` for launcher help and `dsh --profile <name> --help` for that profile's app help.

## Profiles

A profile directory holds a `package.json` with its ordered `dsh.profile.bundles` list, plus `cordis.patch.yml` for user overrides. The tree is composed over an empty root:

- bundle patches, in manifest order;
- the profile's `cordis.patch.yml`;
- the home-level `$DSH_HOME/cordis.patch.yml`;
- any `--patch` overlays, in argument order.

Bundle packages resolve from the dsh installation first, then from the profile's `node_modules`. The [CLI behavior reference](reference/README.md) documents precedence, plugin management, shutdown, and source execution.

## Development

Production runs require built package artifacts. From the repository root, run `pnpm run build`, then use `pnpm dsh <args...>` to run the TypeScript entry. The source-execution reference documents its module-resolution contract.
