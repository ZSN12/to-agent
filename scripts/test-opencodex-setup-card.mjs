import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const componentPath = path.join(process.cwd(), 'src/features/models/OpenCodexSetupCard.tsx')
const outputPath = path.join(process.cwd(), `.opencodex-setup-card-test-${process.pid}.mjs`)

try {
  await build({
    entryPoints: [componentPath],
    outfile: outputPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    jsx: 'automatic',
    logLevel: 'silent',
  })
  const { OpenCodexSetupCard, getComposerContinuationPresentation } = await import(pathToFileURL(outputPath).href)

  assert.deepEqual(getComposerContinuationPresentation({
    proxyUp: true,
    proxyVersion: '2.79.0',
    composerContinuationOk: true,
  }), {
    className: 'ok',
    label: 'Composer 工具续写：版本已满足（代理 2.79.0）',
  })
  assert.deepEqual(getComposerContinuationPresentation({
    proxyUp: true,
    proxyVersion: '2.28.0',
    composerContinuationOk: false,
    composerContinuationMinVersion: '2.79.0',
  }), {
    className: 'warn',
    color: 'var(--accent-red)',
    label: 'Composer 工具续写：代理版本过旧（2.28.0，需要 ≥ 2.79.0）',
  })
  assert.deepEqual(getComposerContinuationPresentation({ proxyUp: false, composerContinuationOk: false }), {
    className: 'warn',
    label: 'Composer 工具续写：等待代理启动后验证',
  })

  const markup = renderToStaticMarkup(React.createElement(OpenCodexSetupCard, { bridgeReady: true }))
  assert.match(markup, /Composer 工具续写版本状态/)
  assert.match(markup, /Composer 工具续写：等待代理启动后验证/)
  console.log('test-opencodex-setup-card: ok')
} finally {
  await fs.rm(outputPath, { force: true })
}
