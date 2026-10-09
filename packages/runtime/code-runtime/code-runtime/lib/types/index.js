"use strict";
/**
 * Service Definition for the code-execution capability seam that runs one model-written program against host async bindings.
 * Runtimes know nothing about tools or sessions; consumers own those concerns.
 * @module @z/dsh-code-runtime
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CodeRuntime = exports.PORTABLE_RESERVED_WORDS = exports.DUNDER_MEMBER = exports.RESERVED_ERROR_MEMBERS = exports.RESERVED_BINDING_GLOBALS = void 0;
var cordis_1 = require("@z/cordis");
/**
 * Binding globals EVERY backend refuses because SOME backend owns the slot in
 * the program's namespace: `console` (the worker's log capture), and
 * `__dsh_main__`/`__builtins__`/`__name__` (the Python backend's bootstrap
 * wrapper and seeded module globals; see the [portable-identifier Agent
 * Note](../../../../.agents/notes/implemented/architecture/2026-07-31-code-runtime-portable-identifier-seam.md)),
 * and `__debug__`. One shared set — rather than each backend refusing only its
 * own slots — keeps the portability promise real: a namespace list valid on
 * one backend is valid on all, so a caller cannot pick a name that works on
 * the worker and collides on Python (or vice versa). `__name__` et al. ARE
 * valid portable identifiers, so the identifier rule on
 * `CodeBindingNamespace.global` never rejects them — hence this explicit set.
 * (Error members differ: {@link DUNDER_MEMBER} refuses every dunder form
 * wholesale; binding globals refuse only the names listed here.) `__debug__`
 * is listed for a different reason than a collision: CPython compiles a bare
 * `__debug__` reference to the constant `True` and rejects any assignment to
 * the name at COMPILE time, so an injected global under that name is
 * unreachable from the program — accepted by validation, unusable on the
 * Python backend, which is exactly the split the shared set exists to prevent.
 */
exports.RESERVED_BINDING_GLOBALS = new Set([
    'console',
    '__dsh_main__', '__builtins__', '__name__', '__debug__',
]);
/**
 * `CodeBindingErrorClass.memberNameProperty` names EVERY backend refuses, as
 * one shared contract so a request valid on one backend is valid on all. The
 * JS `Error` exclusions (`name`, `message`, `stack`) and Python's
 * exception-protocol members (`args`, `with_traceback`, `add_note`) are
 * listed by name; dunder-form names (`__x__`, non-empty middle) are refused
 * wholesale — several are constrained CPython descriptors whose `setattr`
 * raises while constructing the rejection, and the exact set is an interpreter
 * version detail. Any other non-empty own property name is accepted everywhere.
 */
exports.RESERVED_ERROR_MEMBERS = new Set([
    'name', 'message', 'stack',
    'args', 'with_traceback', 'add_note',
]);
/**
 * Dunder form (`__x__`, non-empty middle): object-protocol slots in Python,
 * refused as {@link RESERVED_ERROR_MEMBERS | error members} on every backend.
 */
exports.DUNDER_MEMBER = /^__.+__$/;
/**
 * Reserved words of every portable target language (ECMAScript ∪ Python),
 * refused as {@link CodeBindingNamespace.global} / error-class names by all
 * backends. Python is a portability target here even though only the
 * TypeScript worker has a published backend. The portable-identifier contract
 * promises a namespace list valid on one backend is valid on every backend; a
 * per-language check would let `lambda` pass the TypeScript backend and fail
 * the Python one. Extending the seam with a new language means widening this
 * union (a breaking review of existing binding names, by design).
 */
exports.PORTABLE_RESERVED_WORDS = new Set([
    // ECMAScript reserved words and reserved-in-strict-mode names.
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do',
    'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import', 'in',
    'instanceof', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'implements', 'interface', 'package',
    'private', 'protected', 'public', 'arguments', 'eval',
    // Python 3.x keywords and soft keywords not already above ('type' and '_'
    // are soft keywords: legal names in practice, reserved here for safety).
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'def', 'del', 'elif', 'except', 'from',
    'global', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'match', 'type', '_',
]);
/**
 * Registers one `ctx.codeRuntime` implementation. Program, budget, abort, and substrate
 * failures resolve in {@link CodeRunResult}; only Service Definition contract misuse rejects. Implementations bridge
 * structured-cloneable bindings, materialize each declared namespace rejection
 * class, treat programs as hostile peers, isolate runs from one another, and
 * terminate and await in-flight runs during disposal.
 */
var CodeRuntime = /** @class */ (function (_super) {
    __extends(CodeRuntime, _super);
    function CodeRuntime(ctx) {
        return _super.call(this, ctx, 'codeRuntime') || this;
    }
    return CodeRuntime;
}(cordis_1.Service));
exports.CodeRuntime = CodeRuntime;
exports.default = CodeRuntime;
