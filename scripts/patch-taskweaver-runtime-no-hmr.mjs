#!/usr/bin/env node
/**
 * TaskWeaver 嵌入式 Host 不使用 Cordis / client HMR。禁用相关 cordis.patch 行，避免
 * `--expose-internals is required for HMR` 崩溃与多余文件监视。
 */
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TASKWEAVER_RUNTIME_PACKAGES, TASKWEAVER_Z_RUNTIME_DEPLOY_DIR } from '../electron/agent/z-host/resolve-runtime.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** @param {string} runtimeRoot deploy 根目录（含 runtime-packages） */
function resolveDeployPackagesDir(runtimeRoot) {
  const packaged = path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)
  if (fs.existsSync(packaged)) return packaged
  const nodeModules = path.join(runtimeRoot, 'node_modules')
  if (fs.existsSync(nodeModules)) return nodeModules
  return null
}

export async function patchTaskWeaverRuntimeNoHmr(runtimeRoot) {
  const packagesDir = resolveDeployPackagesDir(runtimeRoot)
  if (!packagesDir) {
    throw new Error(`patch-taskweaver-runtime-no-hmr: 缺少 ${path.join(runtimeRoot, TASKWEAVER_RUNTIME_PACKAGES)} 或 node_modules`)
  }
  const targets = [
    path.join(packagesDir, '@z/dsh-base/cordis.patch.yml'),
    path.join(packagesDir, '@z/dsh-web-app/cordis.patch.yml'),
    path.join(packagesDir, '@z/dsh-headless/cordis.patch.yml'),
  ]
  for (const file of targets) {
    if (!fs.existsSync(file)) continue
    const before = await fsp.readFile(file, 'utf8')
    const next = patchCordisPatchYaml(before, path.basename(path.dirname(file)))
    if (next !== before) {
      await fsp.writeFile(file, next, 'utf8')
      console.log(`patch-taskweaver-runtime-no-hmr: ${path.relative(runtimeRoot, file)}`)
    }
  }
}

/** @param {string} text @param {string} bundleLabel */
function patchCordisPatchYaml(text, bundleLabel) {
  let out = text
  out = out.replace(
    /(\n    - id: hmr\n      name: '@z\/cordis-plugin-hmr'\n)(?:      (?:config:\n        root: \['\.'\]\n|disabled: true\n))*/g,
    `\n    - id: hmr\n      name: '@z/cordis-plugin-hmr'\n      disabled: true\n`,
  )
  out = out.replace(
    /\n# TODO: Re-enable shared HMR for Web after its reload lifecycle is tested\.\n- id: hmr\n  disabled: true\n/g,
    '\n# TaskWeaver: Cordis HMR 永久关闭\n- id: hmr\n  disabled: true\n',
  )
  if (bundleLabel === '@z/dsh-web-app') {
    out = out.replace(
      /\n    # The client-plugin reload chain[\s\S]*?\n    - id: client-hmr\n      name: '@z\/dsh-client-hmr'\n/g,
      '\n    # TaskWeaver: client-hmr 已关闭\n    - id: client-hmr\n      name: \'@z/dsh-client-hmr\'\n      disabled: true\n',
    )
  }
  return out
}

/** 同步 vendor/z-runtime 源码 bundle（pnpm deploy 会复制这些 patch） */
export async function patchZRuntimeSourceBundlesNoHmr() {
  const base = path.join(root, 'vendor/z-runtime/packages/bundle/base/cordis.patch.yml')
  const web = path.join(root, 'vendor/z-runtime/packages/bundle/web-app/cordis.patch.yml')
  for (const file of [base, web]) {
    if (!fs.existsSync(file)) return
    const label = file.includes('web-app') ? '@z/dsh-web-app' : '@z/dsh-base'
    const before = await fsp.readFile(file, 'utf8')
    const next = patchCordisPatchYaml(before, label)
    if (next !== before) await fsp.writeFile(file, next, 'utf8')
  }
}

const runtimeArg = process.argv.find((a) => a.startsWith('--runtime='))?.slice('--runtime='.length)
  ?? path.join(root, 'vendor', TASKWEAVER_Z_RUNTIME_DEPLOY_DIR)

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === pathToFileURL(fileURLToPath(import.meta.url)).href

if (isMain) {
  await patchZRuntimeSourceBundlesNoHmr()
  await patchTaskWeaverRuntimeNoHmr(runtimeArg)
}
