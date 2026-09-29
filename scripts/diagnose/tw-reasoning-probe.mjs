#!/usr/bin/env node
/**
 * 探针：DSH 的「模型思考等级（reasoningEffort）」到底是怎么定义、怎么默认、怎么回读的。
 *
 * 做法：用一份**临时 DSH_HOME**，但把用户真实的 settings.yaml / cordis.patch.yml 复制进去，
 * 这样模型目录与全局默认与用户实际环境完全一致，而会话写入落在临时目录，不污染真实数据。
 *
 * 只读 + 临时目录写入，不需要真实凭据（模型目录是 advisory 元数据）。
 */
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'

const PROJECT = '/Users/zsn/Documents/毕设'
const REAL_DSH_HOME = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'taskweaver-desktop',
  'dsh',
)

const { createZHostManager } = await import(
  path.join(PROJECT, 'electron', 'agent', 'z-host', 'spawn-host.mjs')
)

const runtimeRoot = path.join(PROJECT, 'vendor', 'taskweaver-z-runtime')
const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-reasoning-'))
const dshHome = path.join(userDataPath, 'dsh')
fs.mkdirSync(dshHome, { recursive: true })

// 只复制配置，不复制 sessions / storages
for (const name of ['settings.yaml', 'cordis.patch.yml']) {
  const src = path.join(REAL_DSH_HOME, name)
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(dshHome, name))
    console.log(`已复用真实配置: ${name}`)
  }
}

const host = createZHostManager({
  runtimeRoot,
  userDataPath,
  executable: process.execPath,
  startTimeoutMs: 90_000,
})
const { api } = await host.start()
const value = (res, label) => {
  if (res?.result?.ok === false) throw new Error(`${label} 失败: ${JSON.stringify(res.result)}`)
  return res?.result?.value ?? res
}

// ---------- 1. 全局默认选择 ----------
const settings = value(await api.settings.describe({}), 'settings.describe')
const flat = JSON.stringify(settings)
console.log('\n=== 1. 全局默认模型选择（settings 里的 agent-default-model）===')
const defaultSection = settings?.sections?.find?.((s) => s.namespace === 'agent-default-model')
  ?? settings?.values?.['agent-default-model']
  ?? (flat.includes('agent-default-model') ? '(见下)' : null)
console.log('  原始:', JSON.stringify(defaultSection ?? settings?.sections?.map?.((s) => s.namespace) ?? null))

// ---------- 2. 新会话的 current ----------
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ws-'))
const sid = `probe-${Date.now()}`
value(await api.sessions.create({ sessionId: sid, cwd, agentPreset: 'code' }), 'sessions.create')

async function readCurrent(tag) {
  const dir = value(await api.sessions.models({ sessionId: sid }), 'sessions.models')
  console.log(`  ${tag.padEnd(30)} current = ${JSON.stringify(dir.current)}`)
  return dir
}

console.log('\n=== 2. 刚创建、从未 selectModel 的会话 ===')
const fresh = await readCurrent('刚创建')

// ---------- 3. 模型目录里的思考等级元数据 ----------
console.log('\n=== 3. 模型目录声明的思考等级（reasoning.efforts / defaultEffort）===')
for (const group of fresh.groups ?? []) {
  const rows = (group.models ?? []).filter((m) => m.reasoning)
  if (rows.length === 0) {
    console.log(`  [${group.id}] 无任何模型声明 reasoning 元数据`)
    continue
  }
  console.log(`  [${group.id}]`)
  for (const m of rows) {
    const ids = (m.reasoning.efforts ?? []).map((e) => e.id).join(', ')
    console.log(`    ${m.id.padEnd(38)} defaultEffort=${String(m.reasoning.defaultEffort).padEnd(8)} efforts=[${ids}]`)
  }
}

// ---------- 4. selectModel 不带 effort → 看 Host 是否回填默认 ----------
const probeModel = (fresh.groups ?? [])
  .flatMap((g) => (g.models ?? []).map((m) => ({ group: g.id, ...m })))
  .find((m) => m.reasoning)

console.log('\n=== 4. selectModel 不传 reasoningEffort，Host 会不会自己解析出默认值 ===')
if (!probeModel) {
  console.log('  未找到声明 reasoning 的模型，跳过')
} else {
  console.log(`  用模型: ${probeModel.group}/${probeModel.id}  (defaultEffort=${probeModel.reasoning.defaultEffort})`)
  const selected = value(
    await api.sessions.selectModel({ sessionId: sid, provider: probeModel.group, model: probeModel.id }),
    'sessions.selectModel',
  )
  console.log('  selectModel 返回 selected =', JSON.stringify(selected?.selected ?? selected))
  await readCurrent('不带 effort 后回读')

  // ---------- 5. 显式传 effort → 是否往返 ----------
  const explicit = probeModel.reasoning.efforts.at(-1).id
  console.log(`\n=== 5. selectModel 显式传 reasoningEffort="${explicit}" ===`)
  const selected2 = value(
    await api.sessions.selectModel({
      sessionId: sid,
      provider: probeModel.group,
      model: probeModel.id,
      reasoningEffort: explicit,
    }),
    'sessions.selectModel(显式)',
  )
  console.log('  selectModel 返回 selected =', JSON.stringify(selected2?.selected ?? selected2))
  await readCurrent('显式 effort 后回读')
}

// ---------- 6. 一个不支持思考的模型 ----------
const plain = (fresh.groups ?? [])
  .flatMap((g) => (g.models ?? []).map((m) => ({ group: g.id, ...m })))
  .find((m) => !m.reasoning)
if (plain) {
  console.log(`\n=== 6. 未声明 reasoning 的模型: ${plain.group}/${plain.id} ===`)
  const r = value(
    await api.sessions.selectModel({ sessionId: sid, provider: plain.group, model: plain.id }),
    'sessions.selectModel(无 reasoning 模型)',
  )
  console.log('  selected =', JSON.stringify(r?.selected ?? r))
  await readCurrent('切到无 reasoning 模型后')
}

await host.stop()
fs.rmSync(userDataPath, { recursive: true, force: true })
fs.rmSync(cwd, { recursive: true, force: true })
process.exit(0)
