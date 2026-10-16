#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const T95 = [null, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042]

export function statistics(values) {
  const numbers = values.filter(value => typeof value === 'number' && Number.isFinite(value))
  if (!numbers.length) return { n: 0, mean: null, min: null, max: null, ci95: null }
  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  const variance = numbers.length > 1
    ? numbers.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (numbers.length - 1)
    : null
  const t = numbers.length > 1 ? (T95[numbers.length - 1] ?? 1.96) : null
  const margin = variance === null ? null : t * Math.sqrt(variance / numbers.length)
  return {
    n: numbers.length,
    mean,
    min: Math.min(...numbers),
    max: Math.max(...numbers),
    ci95: margin === null ? null : [mean - margin, mean + margin],
  }
}

function configSummary(records) {
  const passed = records.filter(record => record.automatedPassed === true).length
  const checks = records.filter(record => typeof record.automatedPassed === 'boolean').length
  const valueStats = field => statistics(records.map(record => record[field]))
  return {
    runs: records.length,
    automatedPassed: passed,
    automatedChecked: checks,
    automatedPassRate: checks ? passed / checks : null,
    elapsedMs: valueStats('elapsedMs'),
    hostToolCallCount: valueStats('hostToolCallCount'),
    inputTokens: valueStats('inputTokens'),
    outputTokens: valueStats('outputTokens'),
    cacheTokens: valueStats('cacheTokens'),
    costUsd: valueStats('costUsd'),
    costUnavailableRuns: records.filter(record => record.costUsd == null).length,
  }
}

function pairedDifferences(records, baseline, candidate, field) {
  const key = record => `${record.taskId}\0${record.repeat}`
  const left = new Map(records.filter(record => record.config === baseline).map(record => [key(record), record]))
  const differences = []
  for (const record of records) {
    if (record.config !== candidate) continue
    const control = left.get(key(record))
    if (!control) continue
    const before = control[field]
    const after = record[field]
    if (field === 'automatedPassed') {
      if (typeof before === 'boolean' && typeof after === 'boolean') differences.push(Number(after) - Number(before))
    } else if (typeof before === 'number' && Number.isFinite(before) && typeof after === 'number' && Number.isFinite(after)) {
      differences.push(after - before)
    }
  }
  return statistics(differences)
}

export function summarizeResults(records) {
  const configs = [...new Set(records.map(record => record.config).filter(Boolean))].sort()
  const byConfig = Object.fromEntries(configs.map(config => [config, configSummary(records.filter(record => record.config === config))]))
  const taskIds = [...new Set(records.map(record => record.taskId).filter(Boolean))].sort()
  const byTask = Object.fromEntries(taskIds.map(taskId => [taskId, Object.fromEntries(configs.map(config => {
    const rows = records.filter(record => record.taskId === taskId && record.config === config)
    const checked = rows.filter(record => typeof record.automatedPassed === 'boolean')
    return [config, {
      runs: rows.length,
      automatedPassed: checked.filter(record => record.automatedPassed).length,
      automatedChecked: checked.length,
      elapsedMs: statistics(rows.map(record => record.elapsedMs)),
      costUsd: statistics(rows.map(record => record.costUsd)),
    }]
  }))]))
  const baseline = configs.includes('single') ? 'single' : configs[0]
  const pairedAgainstBaseline = Object.fromEntries(configs.filter(config => config !== baseline).map(config => [config, {
    matchedRuns: pairedDifferences(records, baseline, config, 'elapsedMs').n,
    automatedPassRateDelta: pairedDifferences(records, baseline, config, 'automatedPassed'),
    elapsedMsDelta: pairedDifferences(records, baseline, config, 'elapsedMs'),
    hostToolCallCountDelta: pairedDifferences(records, baseline, config, 'hostToolCallCount'),
    inputTokensDelta: pairedDifferences(records, baseline, config, 'inputTokens'),
    outputTokensDelta: pairedDifferences(records, baseline, config, 'outputTokens'),
    cacheTokensDelta: pairedDifferences(records, baseline, config, 'cacheTokens'),
    costUsdDelta: pairedDifferences(records, baseline, config, 'costUsd'),
  }]))
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), records: records.length, baseline, byConfig, byTask, pairedAgainstBaseline }
}

function formatNumber(value, digits = 2) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '不可用'
}

function formatStat(stat, digits = 2) {
  if (!stat?.n) return '不可用'
  const mean = formatNumber(stat.mean, digits)
  return stat.ci95
    ? `${mean}（95% CI ${formatNumber(stat.ci95[0], digits)}–${formatNumber(stat.ci95[1], digits)}，n=${stat.n}）`
    : `${mean}（n=${stat.n}，区间不可估）`
}

export function renderMarkdown(summary, records) {
  const lines = [
    '# Coding Agent 评测汇总',
    '',
    `- 生成时间：${summary.generatedAt}`,
    `- 结果记录：${summary.records}`,
    `- 对照配置：${summary.baseline ?? '无'}`,
    '- “自动通过”仅表示 Agent 进程成功、独立验证命令退出码为 0，且只读任务没有改动；不代表 acceptance 条目已经人工评分。',
    '- 95% 区间按每个配置的运行样本计算；样本少于 2 时明确标为不可估。配对差值使用相同 taskId 与 repeat。',
    '',
    '## 配置汇总',
    '',
    '| 配置 | 自动通过 | 耗时 ms | Host 工具调用 | 输入 token | 输出 token | 缓存 token | 费用 USD | 费用不可用 |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ]
  for (const [config, item] of Object.entries(summary.byConfig)) {
    const rate = item.automatedChecked ? `${item.automatedPassed}/${item.automatedChecked} (${formatNumber(item.automatedPassRate * 100, 1)}%)` : `—/${item.runs}`
    lines.push(`| ${config} | ${rate} | ${formatStat(item.elapsedMs)} | ${formatStat(item.hostToolCallCount)} | ${formatStat(item.inputTokens, 0)} | ${formatStat(item.outputTokens, 0)} | ${formatStat(item.cacheTokens, 0)} | ${formatStat(item.costUsd, 4)} | ${item.costUnavailableRuns}/${item.runs} |`)
  }
  lines.push('', '## 相对 single 的配对差值', '', '正数表示候选配置的指标更高；耗时、token 和费用的正数通常意味着开销增加。', '', '| 配置 | 配对数 | 自动通过率差 | 耗时 ms 差 | 工具调用差 | 输入 token 差 | 输出 token 差 | 缓存 token 差 | 费用 USD 差 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const [config, item] of Object.entries(summary.pairedAgainstBaseline)) {
    const rate = item.automatedPassRateDelta.n ? `${formatNumber(item.automatedPassRateDelta.mean * 100, 1)} pp` : '不可用'
    lines.push(`| ${config} | ${item.matchedRuns} | ${rate} | ${formatStat(item.elapsedMsDelta)} | ${formatStat(item.hostToolCallCountDelta)} | ${formatStat(item.inputTokensDelta, 0)} | ${formatStat(item.outputTokensDelta, 0)} | ${formatStat(item.cacheTokensDelta, 0)} | ${formatStat(item.costUsdDelta, 4)} |`)
  }
  lines.push('', '## 任务明细', '', '| 任务 | 配置 | 自动通过 | 耗时 ms | 费用 USD |', '|---|---|---:|---:|---:|')
  for (const [taskId, byConfig] of Object.entries(summary.byTask)) {
    for (const [config, item] of Object.entries(byConfig)) {
      const pass = item.automatedChecked ? `${item.automatedPassed}/${item.automatedChecked}` : `—/${item.runs}`
      lines.push(`| ${taskId} | ${config} | ${pass} | ${formatStat(item.elapsedMs)} | ${formatStat(item.costUsd, 4)} |`)
    }
  }
  const failed = records.filter(record => record.runOk === false || record.verificationOk === false || record.readOnlyClean === false)
  if (failed.length) {
    lines.push('', '## 失败或不完整运行', '')
    for (const record of failed) lines.push(`- ${record.taskId ?? record.runKey} / ${record.config ?? 'unknown'} / r${record.repeat ?? '?'}：${record.errorCode ?? record.headlessError ?? (record.verificationOk === false ? '独立验证失败' : '运行失败')}`)
  }
  lines.push('')
  return lines.join('\n')
}

async function readJsonl(filePath) {
  const text = await fs.readFile(filePath, 'utf8')
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return []
    try { return [JSON.parse(line)] }
    catch { throw new Error(`${filePath}:${index + 1} is not valid JSON`) }
  })
}

export async function generateEvaluationReport(inputPath, outputDirectory = path.dirname(inputPath)) {
  const rows = await readJsonl(inputPath)
  const records = rows.filter(row => row.kind === 'result')
  const summary = summarizeResults(records)
  await fs.mkdir(outputDirectory, { recursive: true, mode: 0o700 })
  const jsonPath = path.join(outputDirectory, 'summary.json')
  const markdownPath = path.join(outputDirectory, 'summary.md')
  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 })
  await fs.writeFile(markdownPath, renderMarkdown(summary, records), { mode: 0o600 })
  return { summary, jsonPath, markdownPath }
}

async function main(argv) {
  const inputPath = argv[0]
  if (!inputPath || argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/eval-report.mjs <results.jsonl> [--out-dir directory]')
    return inputPath ? 0 : 2
  }
  let outputDirectory = path.dirname(path.resolve(inputPath))
  const outIndex = argv.indexOf('--out-dir')
  if (outIndex >= 0) {
    if (!argv[outIndex + 1]) throw new Error('--out-dir requires a path')
    outputDirectory = path.resolve(argv[outIndex + 1])
  }
  const result = await generateEvaluationReport(path.resolve(inputPath), outputDirectory)
  console.log(JSON.stringify({ status: 'report-created', jsonPath: result.jsonPath, markdownPath: result.markdownPath, runs: result.summary.records }))
  return 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code }).catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
