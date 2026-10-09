#!/usr/bin/env node
import { n as migrateLegacyTaskWeaverHomePatch, t as ensureDeployNodeModules } from "./deploy-layout-OSFmbh9b.js";
import { fileURLToPath } from "node:url";
import { basename, dirname, resolve } from "node:path";
//#region lib/types/entry.js
/**
* Deployed-runtime bootstrap — see `deploy-layout.ts`.
* @module @z/dsh/entry
*/
const entryDir = dirname(fileURLToPath(import.meta.url));
ensureDeployNodeModules(resolve(entryDir, basename(entryDir) === "types" ? "../.." : ".."));
migrateLegacyTaskWeaverHomePatch();
await import("./bin.js");
//#endregion
export {};
