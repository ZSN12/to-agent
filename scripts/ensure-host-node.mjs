#!/usr/bin/env node
/**
 * Download official Node.js binaries into vendor/host-node for macOS packaging.
 */
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const NODE_VERSION = process.env.TASKWEAVER_HOST_NODE_VERSION || '22.18.0'
const destRoot = path.join(root, 'vendor', 'host-node')

function platformArch() {
  if (process.platform !== 'darwin') {
    throw new Error(`ensure-host-node 当前仅支持 macOS 打包（platform=${process.platform}）`)
  }
  const arch = process.env.TASKWEAVER_HOST_NODE_ARCH || process.arch
  if (arch !== 'arm64' && arch !== 'x64') {
    throw new Error(`不支持的 Node 架构：${arch}`)
  }
  return { platform: 'darwin', arch }
}

async function download(url, destination) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`下载 Node 失败（${response.status}）：${url}`)
  }
  await pipeline(response.body, createWriteStream(destination))
}

async function extractNodeTarball(tarballPath, extractDir) {
  await fs.mkdir(extractDir, { recursive: true })
  await execFileAsync('tar', ['-xzf', tarballPath, '-C', extractDir, '--strip-components', '1'])
}

async function main() {
  const { platform, arch } = platformArch()
  const folder = `node-v${NODE_VERSION}-${platform}-${arch}`
  const tarball = `${folder}.tar.gz`
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${tarball}`
  const nodeBin = path.join(destRoot, 'bin', 'node')
  try {
    const existing = await fs.stat(nodeBin)
    if (existing.isFile()) {
      const { stdout } = await execFileAsync(nodeBin, ['-p', 'process.versions.node'])
      if (stdout.trim() === NODE_VERSION) {
        console.log(`[ensure-host-node] 已存在 Node ${stdout.trim()} → ${nodeBin}`)
        return
      }
    }
  } catch {
    /* refresh */
  }

  const work = path.join(root, 'vendor', `.host-node-download-${process.pid}`)
  await fs.rm(work, { recursive: true, force: true })
  await fs.mkdir(work, { recursive: true })
  const tarballPath = path.join(work, tarball)
  console.log(`[ensure-host-node] 下载 ${url}`)
  await download(url, tarballPath)
  const extracted = path.join(work, 'extract')
  await extractNodeTarball(tarballPath, extracted)
  const stagedNode = path.join(extracted, 'bin', 'node')
  await fs.mkdir(path.dirname(nodeBin), { recursive: true })
  await fs.copyFile(stagedNode, nodeBin)
  await fs.chmod(nodeBin, 0o755)
  await fs.rm(work, { recursive: true, force: true })
  const { stdout } = await execFileAsync(nodeBin, ['-p', 'process.versions.node'])
  console.log(`[ensure-host-node] 已安装 Node ${stdout.trim()} → ${nodeBin}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
