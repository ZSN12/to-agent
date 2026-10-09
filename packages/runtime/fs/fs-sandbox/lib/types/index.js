"use strict";
/**
 * `SandboxedFileSystem`: the sandbox-enforcing implementation of the
 * `@z/dsh-fs` Service Definition. It extends `LocalFileSystem` so all
 * text-storage mechanics — resolve, stat, read/stream, list, the atomic
 * write and the read-match-write edit critical section — are the local
 * implementation's, verbatim; this package adds only the per-call POLICY fence
 * on the two mutations. Reads pass through untouched: every mode permits
 * reading.
 *
 * The fence is a policy check in TRUSTED code over a MODEL-CONTROLLED path,
 * NOT a kernel boundary — the operations are the seam's own (open, rename),
 * and only the target path is untrusted, so canonicalize-then-contain is the
 * complete answer to this surface. Kernel-grade isolation of untrusted CODE
 * stays `ctx.shell`'s job (`@z/dsh-bash-sandbox`). This mirrors the
 * `code-runtime` stance: containment, not a security boundary. The residual
 * TOCTOU (an ancestor symlink swapped between the containment re-check and the
 * syscall) is narrowed by re-canonicalizing immediately before delegating and
 * is accepted for this threat model.
 *
 * Per-call policy: `read-only` denies every mutation; `workspace-write` allows
 * a mutation only when the target canonicalizes under the policy's workspace
 * root or a platform temp area (the SAME writable-root set Seatbelt grants,
 * derived from the one `writableRoots` function so bash and fs cannot drift);
 * `danger-full-access` delegates unfenced. A denial throws the structured
 * `FS_SANDBOX_DENIED` — no text inference is needed (unlike bash's kernel
 * stderr), because an in-process fence knows exactly what it refused. The
 * escalation retry lives in the tool layer (`@z/dsh-tool-fs`),
 * exactly as bash's does.
 *
 * @module @z/dsh-fs-sandbox
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxedFileSystem = void 0;
var dsh_fs_local_1 = require("@z/dsh-fs-local");
var dsh_fs_1 = require("@z/dsh-fs");
var dsh_sandbox_1 = require("@z/dsh-sandbox");
var containment_ts_1 = require("./containment.ts");
/**
 * Sandbox-enforcing filesystem backend. Registers as `ctx.fs` (loading it
 * INSTEAD OF `dsh-fs-local`, together with a `ctx.sandboxPolicy`, is the whole
 * swap — the model-facing tools are untouched). Its configured default mode is
 * the capability fact exposed by {@link sandboxMode}; `dsh-tool-fs` resolves
 * each session's mode and cwd into a policy for every mutation, while an
 * approved escalation may stamp a strictly wider mode for one call.
 */
var SandboxedFileSystem = /** @class */ (function (_super) {
    __extends(SandboxedFileSystem, _super);
    function SandboxedFileSystem(ctx, config) {
        var _this = _super.call(this, ctx, config) || this;
        _this.defaultMode = ctx.sandboxPolicy.defaultMode;
        return _this;
    }
    Object.defineProperty(SandboxedFileSystem.prototype, "sandboxMode", {
        /** The deployment default mode — the capability fact the tool layer reads to advertise escalation. */
        get: function () {
            return this.defaultMode;
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Fence the write by the per-call policy, then delegate to the inherited
     * atomic write. See {@link checkedTarget}.
     * @param target - the resolved target to write.
     * @param content - the full new file content.
     * @param expected - the write intent guarding the write; omit for unconditional.
     * @param signal - aborts before atomic publication takes effect.
     * @param sandboxPolicy - the per-call mode and workspace root; omit to use
     *   the deployment fallback.
     * @returns the write outcome from the inherited backend.
     */
    SandboxedFileSystem.prototype.writeText = function (target, content, expected, signal, sandboxPolicy) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _b = (_a = _super.prototype.writeText).call;
                        _c = [this];
                        return [4 /*yield*/, this.checkedTarget(target, sandboxPolicy)];
                    case 1: return [2 /*return*/, _b.apply(_a, _c.concat([_d.sent(), content, expected, signal]))];
                }
            });
        });
    };
    /**
     * Fence the edit by the per-call policy, then delegate to the inherited
     * atomic edit. See {@link checkedTarget}.
     * @param target - the resolved target to edit.
     * @param edit - the literal search/replace request.
     * @param expected - the version guard; omit for an unconditional edit.
     * @param signal - aborts before atomic publication takes effect.
     * @param sandboxPolicy - the per-call mode and workspace root; omit to use
     *   the deployment fallback.
     * @returns the edit outcome from the inherited backend.
     */
    SandboxedFileSystem.prototype.editText = function (target, edit, expected, signal, sandboxPolicy) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, _b, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _b = (_a = _super.prototype.editText).call;
                        _c = [this];
                        return [4 /*yield*/, this.checkedTarget(target, sandboxPolicy)];
                    case 1: return [2 /*return*/, _b.apply(_a, _c.concat([_d.sent(), edit, expected, signal]))];
                }
            });
        });
    };
    /**
     * Enforce the per-call policy against `target` and return the EXACT target the
     * mutation must use, so the checked identity is the mutated one (no
     * check-here-write-there TOCTOU). `read-only` denies; `workspace-write`
     * re-canonicalizes NOW (`resolve` realpaths the deepest existing ancestor,
     * reflecting a concurrently swapped symlink), requires containment under a
     * writable root, and returns THAT fresh target; `danger-full-access` returns
     * the caller's target unfenced. Throws the structured `FS_SANDBOX_DENIED` on
     * refusal — the tool layer maps it to the model-facing `[sandbox: …]` marker
     * and the escalation hint.
     */
    SandboxedFileSystem.prototype.checkedTarget = function (target, sandboxPolicy) {
        return __awaiter(this, void 0, void 0, function () {
            var policy, mode, fresh, contained, _i, _a, root;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        policy = sandboxPolicy !== null && sandboxPolicy !== void 0 ? sandboxPolicy : this.ctx.sandboxPolicy.resolve();
                        mode = policy.mode;
                        if (mode === 'danger-full-access')
                            return [2 /*return*/, target];
                        if (mode === 'read-only') {
                            throw new dsh_fs_1.FsError("cannot write \"".concat(target.displayPath, "\": file access denied under read-only mode"), 'FS_SANDBOX_DENIED');
                        }
                        return [4 /*yield*/, this.resolve(target.displayPath)];
                    case 1:
                        fresh = _b.sent();
                        contained = false;
                        _i = 0, _a = (0, dsh_sandbox_1.writableRoots)(policy);
                        _b.label = 2;
                    case 2:
                        if (!(_i < _a.length)) return [3 /*break*/, 5];
                        root = _a[_i];
                        return [4 /*yield*/, (0, containment_ts_1.isPathUnder)(fresh.targetKey, root)];
                    case 3:
                        if (_b.sent()) {
                            contained = true;
                            return [3 /*break*/, 5];
                        }
                        _b.label = 4;
                    case 4:
                        _i++;
                        return [3 /*break*/, 2];
                    case 5:
                        if (!contained) {
                            throw new dsh_fs_1.FsError("cannot write \"".concat(target.displayPath, "\": file access denied under workspace-write mode"), 'FS_SANDBOX_DENIED');
                        }
                        return [2 /*return*/, fresh];
                }
            });
        });
    };
    SandboxedFileSystem.inject = ['sandboxPolicy'];
    return SandboxedFileSystem;
}(dsh_fs_local_1.LocalFileSystem));
exports.SandboxedFileSystem = SandboxedFileSystem;
exports.default = SandboxedFileSystem;
