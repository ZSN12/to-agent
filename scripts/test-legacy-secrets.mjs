#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspectFirstRunSecrets, dismissFirstRunNotice } from '../backend/legacy-secrets.mjs'

console.log('--- 测试 legacy-secrets 首次启动密钥重填扫描 ---')

const tmpDir = path.join(os.tmpdir(), `tw-test-legacy-secrets-${Date.now()}`)
fs.mkdirSync(tmpDir, { recursive: true })

try {
  // 1. 模拟旧版 credentials.enc
  const credFile = path.join(tmpDir, 'credentials.enc')
  fs.writeFileSync(credFile, 'fake-encrypted-blob-v10', 'utf8')

  // 2. 模拟旧版 models.json (含 API Key 提供方)
  const modelsFile = path.join(tmpDir, 'models.json')
  fs.writeFileSync(modelsFile, JSON.stringify({
    providers: {
      deepseek: { name: 'DeepSeek', authType: 'api-key' },
      openai: { name: 'OpenAI', authType: 'api-key' },
      ollama: { name: 'Ollama' }, // 本地无需 key
    },
  }), 'utf8')

  // 3. 首次扫描
  console.log('1. 执行首次扫描...')
  const report1 = await inspectFirstRunSecrets(tmpDir)
  assert.equal(report1.dismissed, false)
  assert.ok(report1.items.length >= 2, '应扫描出至少 2 个需要输入 key 的模型提供方')
  assert.ok(report1.items.some((i) => i.label.includes('DeepSeek')))
  assert.ok(report1.items.some((i) => i.label.includes('OpenAI')))
  assert.ok(!report1.items.some((i) => i.label.includes('Ollama')), 'Ollama 本地模型不应提示输入 key')

  // 检查旧 credentials.enc 是否已归档
  assert.equal(fs.existsSync(credFile), false, '旧 credentials.enc 应已被删除/移走')
  assert.ok(fs.existsSync(`${credFile}.electron-legacy`), '旧 credentials.enc.electron-legacy 备份应存在')
  console.log('✓ credentials.enc 归档正常，密钥重填项提取正确')

  // 4. 用户点击「知道了」Dismiss
  console.log('2. 执行 dismissFirstRunNotice...')
  await dismissFirstRunNotice(tmpDir)

  // 5. 第二次扫描应保持 dismissed: true
  const report2 = await inspectFirstRunSecrets(tmpDir)
  assert.equal(report2.dismissed, true, '再次启动时应识别为已关闭')
  console.log('✓ 状态持久化与不再提示验证通过')

  console.log('--- legacy-secrets 测试全部通过！---')
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
