#!/usr/bin/env node
import { n as migrateLegacyTaskWeaverHomePatch, t as ensureDeployNodeModules } from "./deploy-layout-Dmt-qEOj.js";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
//#region lib/types/entry.js
/**
* Deployed-runtime bootstrap — see `deploy-layout.ts`.
* @module @taskweaver/dsh/entry
*/
const entryDir = dirname(fileURLToPath(import.meta.url));
const runtimeRoot = resolve(entryDir, basename(entryDir) === "types" ? "../.." : "..");
ensureDeployNodeModules(runtimeRoot);
migrateLegacyTaskWeaverHomePatch();
await import("./bin.js");
//#endregion
export {};
