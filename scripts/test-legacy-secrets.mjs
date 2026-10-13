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
  // 1. tw-b64 是可迁移格式，首次启动提示必须只读，不能挪走凭据。
  const credFile = path.join(tmpDir, 'credentials.enc')
  const legacyCredentialPayload = `tw-b64:${Buffer.from(JSON.stringify({ deepseek: { type: 'api-key', key: 'legacy-secret' } })).toString('base64')}`
  fs.writeFileSync(credFile, legacyCredentialPayload, 'utf8')

  // 2. 模拟旧版 models.json (含 API Key 提供方)
  const modelsFile = path.join(tmpDir, 'models.json')
  fs.writeFileSync(modelsFile, JSON.stringify({
    providers: {
      deepseek: { name: 'DeepSeek', authType: 'api-key' },
      openai: { name: 'OpenAI', authType: 'api-key' },
      ollama: { name: 'Ollama' }, // 本地无需 key
    },
  }), 'utf8')

  const mcpFile = path.join(tmpDir, 'taskweaver-mcp.json')
  fs.writeFileSync(mcpFile, JSON.stringify({
    servers: [
      { id: 'github', name: 'GitHub MCP', env: { GITHUB_PERSONAL_ACCESS_TOKEN: 'enc:aes256:old-ciphertext' } },
      { id: 'safe', name: 'Already in Keychain', env: { TOKEN: 'keychain:mcp:safe:TOKEN' } },
    ],
  }), 'utf8')

  // 3. 首次扫描
  console.log('1. 执行首次扫描...')
  const report1 = await inspectFirstRunSecrets(tmpDir)
  assert.equal(report1.dismissed, false)
  assert.ok(report1.items.length >= 2, '应扫描出至少 2 个需要输入 key 的模型提供方')
  assert.ok(report1.items.some((i) => i.label.includes('DeepSeek')))
  assert.ok(report1.items.some((i) => i.label.includes('OpenAI')))
  assert.ok(!report1.items.some((i) => i.label.includes('Ollama')), 'Ollama 本地模型不应提示输入 key')
  assert.ok(report1.items.some((i) => i.kind === 'mcp' && i.label.includes('[GitHub MCP]')))
  assert.ok(!report1.items.some((i) => i.label.includes('[0]')), 'MCP 标签应使用服务器名，不应显示数组下标')
  assert.ok(!report1.items.some((i) => i.label.includes('Already in Keychain')), '可读取的 Keychain 凭据不应要求重新输入')

  assert.equal(fs.readFileSync(credFile, 'utf8'), legacyCredentialPayload, 'app:getFirstRunNotice 对 tw-b64 文件必须只读')
  assert.equal(fs.existsSync(`${credFile}.electron-legacy`), false, '只读扫描不得归档或删除 credentials.enc')
  assert.equal(fs.existsSync(path.join(tmpDir, 'taskweaver-p19-cutover.json')), false, '首次只读扫描不得创建迁移标记')
  console.log('✓ 首次扫描只读；tw-b64 保留，MCP 列表按服务器名检查')

  // Chromium v10 密文只报告需重新输入，实际归档由凭据读取路径处理。
  const chromiumBlob = Buffer.from('v10-encrypted-payload').toString('base64')
  fs.writeFileSync(credFile, chromiumBlob, 'utf8')
  const chromiumReport = await inspectFirstRunSecrets(tmpDir)
  assert.ok(chromiumReport.items.some((i) => i.label.includes('旧版模型凭据')))
  assert.equal(fs.readFileSync(credFile, 'utf8'), chromiumBlob, '只读扫描不得搬动 Chromium 密文')
  fs.writeFileSync(credFile, legacyCredentialPayload, 'utf8')

  // 4. 用户点击「知道了」Dismiss
  console.log('2. 执行 dismissFirstRunNotice...')
  await dismissFirstRunNotice(tmpDir)

  // 5. 第二次扫描应保持 dismissed: true
  const report2 = await inspectFirstRunSecrets(tmpDir)
  assert.equal(report2.dismissed, true, '再次启动时应识别为已关闭')
  assert.equal(fs.readFileSync(credFile, 'utf8'), legacyCredentialPayload, '关闭提示不得改动凭据文件')
  console.log('✓ 状态持久化与不再提示验证通过')

  console.log('--- legacy-secrets 测试全部通过！---')
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
