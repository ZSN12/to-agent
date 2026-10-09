#!/usr/bin/env node
/**
 * scripts/check-model-boundary.mjs
 * 
 * 模型抽象护栏门禁检查脚本
 * 
 * 规则：
 * 业务代码（electron/backend/* 与 src/）严禁直接 import / require 任何厂商专有 SDK
 * （如 openai, @anthropic-ai/sdk, @google/genai 等）。
 * 必须统一经由适配层（custom-provider-service.mjs, model-service.mjs 等）调用。
 * 
 * 支持参数：
 *   --self-test: 自测模式，注入合成用例断言拦截精准度，并验证真实代码库全绿。
 */

import fsp from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

// 扫描目录
export const SCAN_DIRECTORIES = ['electron/backend', 'src']

// 扫描文件后缀
export const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx'])

// 禁用的厂商专有 SDK 列表
export const BANNED_SDK_PACKAGES = [
  'openai',
  '@anthropic-ai/sdk',
  '@google/genai',
  '@google/generative-ai',
  '@azure/openai',
  '@mistralai/mistralai',
  'groq-sdk',
  '@cohere/cohere-sdk',
  'cohere-ai',
  'ollama',
  '@aws-sdk/client-bedrock-runtime',
]

// 允许直接引用/适配的白名单文件（相对 REPO_ROOT 规范路径）
export const WHITELIST_FILES = new Set([
  'electron/backend/custom-provider-service.mjs',
  'electron/backend/model-service.mjs',
])

/**
 * 判断模块引入说明符是否为受限 SDK
 * @param {string} specifier
 * @returns {string | null} 匹配到的禁忌包名，或 null
 */
export function matchBannedSdk(specifier) {
  if (!specifier || typeof specifier !== 'string') return null
  const clean = specifier.trim()
  for (const pkg of BANNED_SDK_PACKAGES) {
    if (clean === pkg || clean.startsWith(`${pkg}/`)) {
      return pkg
    }
  }
  return null
}

/**
 * 正则提取代码中的 import / require 说明符及大致行号
 * @param {string} content
 * @returns {Array<{ line: number, specifier: string, raw: string }>}
 */
export function extractImportSpecifiers(content) {
  const results = []
  const lines = content.split('\n')

  // 1. import ... from '...' 或 export ... from '...'
  const staticImportRegex = /(?:import|export)\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/
  // 2. 动态 import('...')
  const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/
  // 3. require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i]
    // 忽略单行注释
    const trimmed = lineText.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue

    const staticMatch = lineText.match(staticImportRegex)
    if (staticMatch) {
      results.push({ line: i + 1, specifier: staticMatch[1], raw: lineText.trim() })
      continue
    }

    const dynMatch = lineText.match(dynamicImportRegex)
    if (dynMatch) {
      results.push({ line: i + 1, specifier: dynMatch[1], raw: lineText.trim() })
      continue
    }

    const reqMatch = lineText.match(requireRegex)
    if (reqMatch) {
      results.push({ line: i + 1, specifier: reqMatch[1], raw: lineText.trim() })
      continue
    }
  }

  return results
}

/**
 * 递归收集目录下所有目标文件
 * @param {string} dirPath
 * @returns {Promise<string[]>}
 */
export async function collectFiles(dirPath) {
  const found = []
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue
        found.push(...(await collectFiles(fullPath)))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (EXTENSIONS.has(ext)) {
          found.push(fullPath)
        }
      }
    }
  } catch {
    // 目录不存在则跳过
  }
  return found
}

/**
 * 检查单个文件或内容是否违规
 * @param {string} relativePath
 * @param {string} content
 * @returns {Array<{ file: string, line: number, specifier: string, bannedPkg: string, raw: string }>}
 */
export function checkFileContent(relativePath, content) {
  const normalizedRel = relativePath.split(path.sep).join('/')
  if (WHITELIST_FILES.has(normalizedRel)) {
    return []
  }

  const violations = []
  const imports = extractImportSpecifiers(content)
  for (const item of imports) {
    const banned = matchBannedSdk(item.specifier)
    if (banned) {
      violations.push({
        file: normalizedRel,
        line: item.line,
        specifier: item.specifier,
        bannedPkg: banned,
        raw: item.raw,
      })
    }
  }
  return violations
}

/**
 * 执行完整扫描
 * @param {string} rootDir
 * @returns {Promise<{ scannedFiles: number, violations: Array<any> }>}
 */
export async function runBoundaryCheck(rootDir = REPO_ROOT) {
  let scannedFiles = 0
  const violations = []

  for (const scanDir of SCAN_DIRECTORIES) {
    const absoluteScanDir = path.join(rootDir, scanDir)
    const files = await collectFiles(absoluteScanDir)
    for (const filePath of files) {
      scannedFiles += 1
      const rel = path.relative(rootDir, filePath)
      const content = await fsp.readFile(filePath, 'utf8')
      const fileViolations = checkFileContent(rel, content)
      if (fileViolations.length > 0) {
        violations.push(...fileViolations)
      }
    }
  }

  return { scannedFiles, violations }
}

/**
 * 自测模式验证门禁的有效性
 */
export async function runSelfTest() {
  console.log('🧪 正在执行 check-model-boundary 自测模式 (--self-test)...')

  // 1. 先验证真实代码库无违规
  const realResult = await runBoundaryCheck(REPO_ROOT)
  assert.equal(realResult.violations.length, 0, `真实代码库应无违规，但检测到: ${JSON.stringify(realResult.violations)}`)
  assert.ok(realResult.scannedFiles > 50, `应当扫描到至少 50 个业务代码文件，实际: ${realResult.scannedFiles}`)
  console.log(`  ✓ 真实代码库扫描测试通过 (已扫描 ${realResult.scannedFiles} 个文件，0 违规)`)

  // 2. 模拟注入测试：业务代码违规导入 openai
  const codeOpenAI = `
    import OpenAI from 'openai'
    export function doSomething() {}
  `
  const v1 = checkFileContent('src/features/chat/fake-agent.ts', codeOpenAI)
  assert.equal(v1.length, 1)
  assert.equal(v1[0].bannedPkg, 'openai')
  assert.equal(v1[0].specifier, 'openai')
  assert.equal(v1[0].line, 2)
  console.log('  ✓ 注入 import OpenAI from "openai" 拦截成功')

  // 3. 模拟注入测试：动态 import @anthropic-ai/sdk
  const codeAnthropic = `
    async function load() {
      const { Anthropic } = await import('@anthropic-ai/sdk')
    }
  `
  const v2 = checkFileContent('electron/backend/dsh-chat-service.mjs', codeAnthropic)
  assert.equal(v2.length, 1)
  assert.equal(v2[0].bannedPkg, '@anthropic-ai/sdk')
  console.log('  ✓ 注入 import("@anthropic-ai/sdk") 拦截成功')

  // 4. 模拟注入测试：子路径导入 @google/genai/dist
  const codeGoogle = `
    const google = require('@google/genai/dist/v1')
  `
  const v3 = checkFileContent('src/main.ts', codeGoogle)
  assert.equal(v3.length, 1)
  assert.equal(v3[0].bannedPkg, '@google/genai')
  console.log('  ✓ 注入 require("@google/genai/...") 拦截成功')

  // 5. 白名单文件允许测试：custom-provider-service.mjs 与 model-service.mjs
  const vWhite1 = checkFileContent('electron/backend/custom-provider-service.mjs', codeOpenAI)
  assert.equal(vWhite1.length, 0, '白名单 custom-provider-service 应豁免')
  const vWhite2 = checkFileContent('electron/backend/model-service.mjs', codeAnthropic)
  assert.equal(vWhite2.length, 0, '白名单 model-service 应豁免')
  console.log('  ✓ 适配通道白名单豁免逻辑验证成功')

  // 6. 安全合法导入不应误报
  const legitimateCode = `
    import { Client } from '@modelcontextprotocol/client'
    import React from 'react'
    import { customFetch } from './custom-provider-service.mjs'
    const model = 'openai-codex/gpt-4o' // 纯字符串，非包引用
  `
  const vLegit = checkFileContent('src/features/chat/ChatTurn.tsx', legitimateCode)
  assert.equal(vLegit.length, 0, '合法导入与字符串常量不应误报')
  console.log('  ✓ 合法依赖与模型标识字符串无误报验证成功')

  console.log('🎉 check-model-boundary --self-test 全部通过！\n')
}

// 主流程
async function main() {
  const isSelfTest = process.argv.includes('--self-test')

  if (isSelfTest) {
    await runSelfTest()
    process.exit(0)
  }

  const { scannedFiles, violations } = await runBoundaryCheck(REPO_ROOT)

  if (violations.length > 0) {
    console.error('❌ 模型抽象护栏违规！业务代码中检测到直接导入厂商专有 SDK：')
    for (const v of violations) {
      console.error(`  - ${v.file}:${v.line} 引入了「${v.specifier}」(${v.bannedPkg})`)
      console.error(`    代码行: ${v.raw}`)
    }
    console.error('\n⚠️ 规则说明：')
    console.error('业务层（electron/backend/* 与 src/）禁止直接引用厂商专有 SDK（如 openai, @anthropic-ai/sdk 等）。')
    console.error('所有模型交互必须经过统一通道适配层（custom-provider-service.mjs / model-service.mjs）。')
    process.exit(1)
  }

  console.log(`✅ 模型抽象护栏检查通过: 已扫描 ${scannedFiles} 个源文件，未发现违规厂商专有 SDK 导入。`)
}

// 若作为主脚本执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error('门禁检查执行失败:', err)
    process.exit(1)
  })
}
