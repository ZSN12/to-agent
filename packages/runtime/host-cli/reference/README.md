# `dsh` CLI behavior reference

Argv is parsed once through [`src/args.ts`](../src/args.ts), and [`src/bin.ts`](../src/bin.ts) dynamically loads the selected runner.

## Profile boot

`dsh --profile <name>` boots `$DSH_HOME/profiles/<name>`. The effective tree is composed over an empty root, in this order:

1. Each bundle patch in `dsh.profile.bundles` order.
2. The profile's `cordis.patch.yml`.
3. The home-level `$DSH_HOME/cordis.patch.yml`.
4. Each `--patch <path>` overlay in argv order.

Later layers replace the targeted row's complete `config` value; they do not deep-merge keys. Layers can also insert rows. Parse, schema, resolution, and plugin boot failures exit nonzero. SIGINT and SIGTERM dispose the mounted root before exit.

Bundle names resolve from the dsh installation first, then from the profile directory. Bare plugin names in patch rows resolve through the profile's Node module path, which the launcher maintains from the installation's dependency closure. Missing profiles report a `dsh plugin --profile <name> add <package>` hint.

### App arguments

Launcher flags come first and end at the first token the launcher does not recognize. Everything after that boundary reaches the profile through `ctx.cmdlineArgs`; an app plugin may parse the shared immutable snapshot ([`dsh-cmdline`](../../../packages/boot/cmdline/README.md)). For example, `dsh --profile <name> --resume <session>` passes `--resume <session>` to the app. `dsh --profile <name> --help` delegates help to that app; bare `dsh --help` prints launcher help.

The app owns its argument grammar. A provider can parse arguments and provide a service before dependent rows start. A config expression that injects that service can then use the invocation value; replacing the row's full `config` in a later patch also replaces that expression. Help and rejected app arguments can request an exit before startup-dependent rows activate.

Launcher flags must precede app arguments. The launcher consumes one `--`; to pass a literal `--` to an app, use `-- --`. `-V` and `--version` print the launcher version when they appear before the app-argument boundary. A profile without an app argument reader ignores the forwarded arguments.

## Config inspection

Inspect the composed tree without booting it:

```sh
dsh --profile <name> --dump-default-config
dsh --profile <name> --patch ./extra.yml --dump-config
```

`--dump-default-config` prints only bundle layers. `--dump-config` also applies the profile layer, home layer, and `--patch` overlays. Output comments identify the source file for each row and every layer that changed it. `!!js` expressions remain unevaluated, and unmatched patch targets are reported on stderr. Dumps do not run app command-line providers and reject app arguments.

## Plugin management

`dsh plugin --profile <name> <args...>` initializes a missing profile, then forwards the arguments to `pnpm` in that profile directory. `add`, `remove`, `why`, `update`, and other pnpm commands are passed through. Relative path specifications such as `.` and `../plugin`, including `file:` and `link:` forms, are anchored to the invoking directory before pnpm runs.

After a successful pnpm command, the launcher reconciles `dsh.profile.bundles` with installed dependencies. A dependency declaring `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` joins the profile's layer stack. A dependency without a bundle patch remains installed as a plain dependency; removing a dependency removes its bundle layer. Restart a running profile after adding, removing, or updating a bundle. Ordinary edits to profile and home patch files apply through hot reload.

## Runtime behavior

The invoking directory is the default workspace root. The process starts one profile and keeps it mounted for the session. Valid edits to the profile and home `cordis.patch.yml` layers are watched and applied transactionally; shutdown also disposes those watchers.

The first SIGINT or SIGTERM starts graceful disposal. SIGTERM exits with status 0 and SIGINT with status 130 after disposal. A second signal forces immediate exit. If disposal exceeds its deadline, the launcher escalates to an immediate exit.

## Source execution

From the repository root, run `pnpm run build` after a fresh checkout and whenever package artifacts need updating, then use `pnpm dsh <args...>`. The script launches `host-cli/src/bin.ts` with `node --import tsx/esm` and forwards arguments. The installed executable launches `host-cli/lib/bin.js` without rebuilding the repository.
