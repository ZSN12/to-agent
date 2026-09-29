#!/usr/bin/env node
/**
 * Deployed-runtime bootstrap — see `deploy-layout.ts`.
 * @module @deepseek-ai/dsh/entry
 */

import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDeployNodeModules, migrateLegacyTaskWeaverHomePatch } from './deploy-layout.ts'

const entryDir = dirname(fileURLToPath(import.meta.url))
const runtimeRoot = resolve(entryDir, basename(entryDir) === 'types' ? '../..' : '..')
ensureDeployNodeModules(runtimeRoot)
migrateLegacyTaskWeaverHomePatch()

await import('./bin.js')
