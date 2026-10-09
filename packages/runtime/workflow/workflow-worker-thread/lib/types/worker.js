"use strict";
/**
 * Single-statement worker entry that boots `runWorkerSession` on real `parentPort`. Logic remains in
 * the session module for in-process MessageChannel coverage; importing this entry on the main thread
 * exercises `requireParentPort`'s failure path.
 * @module @z/dsh-workflow-worker-thread/worker
 */
Object.defineProperty(exports, "__esModule", { value: true });
var node_worker_threads_1 = require("node:worker_threads");
var session_ts_1 = require("./session.ts");
// workerData is `any` at the node:worker_threads boundary; the engine is the
// only spawner and always provides a WorkerInit.
void (0, session_ts_1.runWorkerSession)((0, session_ts_1.requireParentPort)(node_worker_threads_1.parentPort), node_worker_threads_1.workerData);
