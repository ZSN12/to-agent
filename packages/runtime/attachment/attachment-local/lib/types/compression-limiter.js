"use strict";
/** Instance-owned concurrency bound for native image transformations. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompressionLimiter = void 0;
/** FIFO limiter for asynchronous compression work. */
var CompressionLimiter = /** @class */ (function () {
    /**
     * @param concurrency - positive maximum number of active tasks.
     */
    function CompressionLimiter(concurrency) {
        this.concurrency = concurrency;
        this.active = 0;
        this.waiting = [];
    }
    /**
     * Run one task after an instance slot becomes available.
     * @param task - compression operation occupying one slot until settlement.
     * @returns the task result.
     */
    CompressionLimiter.prototype.run = function (task) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var start = function () {
                _this.active += 1;
                var release = function () {
                    var _a;
                    _this.active -= 1;
                    (_a = _this.waiting.shift()) === null || _a === void 0 ? void 0 : _a();
                };
                void Promise.resolve().then(task).then(function (value) {
                    release();
                    resolve(value);
                }, function (error) {
                    release();
                    reject(error instanceof Error
                        ? error
                        : new Error('Image compression task rejected with a non-Error value.', { cause: error }));
                });
            };
            if (_this.active < _this.concurrency)
                start();
            else
                _this.waiting.push(start);
        });
    };
    return CompressionLimiter;
}());
exports.CompressionLimiter = CompressionLimiter;
