"use strict";
/**
 * @z/dsh-cmdline — the command line a dsh launcher hands to the app
 * it boots.
 *
 * The launcher parses only its own flags (`--profile`, `--patch`, the config
 * dumps) and hands everything after them to the tree verbatim through the
 * {@link CmdlineArgs} service, so an app owns its flag family, its `--help`
 * text, and its parse errors instead of the launcher knowing them.
 *
 * Any app plugin can inject `cmdlineArgs` and call {@link parseCmdline}. A
 * provider may publish the parsed values as its own service from its program's
 * commander action, and ordinary rows
 * can inject that service and read it from lazily resolved config —
 * `port: !!js ctx.webStartup.port ?? 3080` — so a flag beats the value written
 * beside it. No row has launcher-level command-line status.
 * @module @z/dsh-cmdline
 */
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.internals = void 0;
exports.provideCmdline = provideCmdline;
exports.parseCmdline = parseCmdline;
/**
 * Provide the command line and the exit request on a host context before any
 * tree entry mounts. Both are launcher facts, not config: an embedding host
 * with no command line provides an empty argument list.
 * @param ctx - the host context the tree will mount under.
 * @param host - the invocation's arguments and its exit request.
 */
function provideCmdline(ctx, host) {
    var snapshot = Object.freeze(__spreadArray([], host.args, true));
    ctx.provide('cmdlineArgs', { get: function () { return snapshot; } });
    ctx.provide('appExit', host.exit);
}
/** The process streams commander output is written to; production writes to the process. */
exports.internals = {
    stdout: process.stdout,
    stderr: process.stderr,
};
/**
 * Parse the launcher's immutable argument snapshot with an app's commander
 * program. Commander runs the program's own synchronous action handler on a
 * successful parse; app code there publishes its service and rejects an
 * invalid invocation with `program.error(...)`. This helper has no Loader-row
 * or service ownership semantics.
 *
 * Help, version, and rejected arguments — from the grammar or from an action
 * — are terminal for the process: commander writes the text and the helper
 * requests `ctx.appExit`. The action never runs on help, version, or a
 * grammar rejection; an action must reject before it publishes, because
 * statements before its `program.error(...)` have already run.
 * @param ctx - plugin context carrying `cmdlineArgs` and `appExit`.
 * @param program - the app's commander program, with its flags, description,
 * actions, and any subcommands already declared.
 * @throws when the launcher did not provide the command line and exit request,
 * or when no command in the program declares an action.
 */
function parseCmdline(ctx, program) {
    // Read through the global service store, not the property proxy: appExit is
    // an optional host value and the plugin only needs to inject cmdlineArgs.
    var args = ctx.get('cmdlineArgs');
    var exit = ctx.get('appExit');
    if (args === undefined || exit === undefined) {
        throw new Error("".concat(program.name(), ": the launcher must provide ctx.cmdlineArgs and ctx.appExit before the tree mounts"));
    }
    if (!hasAction(program)) {
        throw new Error("".concat(program.name(), ": no command in the program declares an action; parseCmdline runs the invoked command's action on a successful parse, and app code there publishes its service"));
    }
    configureExitAndOutput(program);
    try {
        program.parse(args.get(), { from: 'user' });
    }
    catch (error) {
        // exitOverride turns help, version, a parse error, and the action's own
        // program.error() into a CommanderError; commander has already written the
        // text through the output configured above.
        if (!isCommanderError(error))
            throw error;
        exit(error.exitCode);
    }
}
/**
 * Whether any command in the tree declares an action handler.
 *
 * The `Command` type cannot express the action precondition, so the handler is
 * read structurally (as {@link isCommanderError} reads commander's control-flow
 * errors): without this guard, a program that forgot its action would parse
 * successfully, publish nothing, and surface only as dependent rows pending on
 * the absent service.
 * @param command - the command whose tree is inspected.
 * @returns true when the command or any registered subcommand has an action.
 */
function hasAction(command) {
    if (typeof command._actionHandler === 'function')
        return true;
    return command.commands.some(hasAction);
}
/**
 * Route every command's exit and output through the launcher adapter.
 *
 * Commander copies `exitOverride` and output configuration into a subcommand
 * only at registration, so a root-only override would let an
 * already-registered subcommand's rejection write to the process streams and
 * call `process.exit` directly, bypassing `ctx.appExit`.
 * @param command - the root of the command tree to configure.
 */
function configureExitAndOutput(command) {
    command
        .exitOverride()
        .configureOutput({
        writeOut: function (text) { return void exports.internals.stdout.write(text); },
        writeErr: function (text) { return void exports.internals.stderr.write(text); },
    });
    for (var _i = 0, _a = command.commands; _i < _a.length; _i++) {
        var child = _a[_i];
        configureExitAndOutput(child);
    }
}
/**
 * Whether a thrown value is commander's own control-flow error (help, version,
 * a parse error, or `program.error`).
 *
 * Detected structurally, not with `instanceof`: an out-of-tree plugin brings
 * its own commander copy, whose `CommanderError` class is a different identity
 * from this package's, and an identity check there would rethrow a printed
 * help as a fatal load failure.
 * @param error - the thrown value.
 * @returns true when the value carries commander's error code and exit code.
 */
function isCommanderError(error) {
    if (typeof error !== 'object' || error === null)
        return false;
    var candidate = error;
    return typeof candidate.code === 'string' && candidate.code.startsWith('commander.')
        && typeof candidate.exitCode === 'number';
}
