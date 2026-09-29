import fs from 'node:fs'
import path from 'node:path'

/**
 * 自动识别工作区类型的验证与构建命令。
 *
 * 选取原则：**自检优先用最轻的命令**。
 * `primaryCommand` 是推荐给 Agent 做自检的命令，应尽量便宜（类型检查 / lint / 语法检查）；
 * 完整构建（如 `pnpm run build` = tsc -b && vite build）放在 `buildCommand`，
 * 只有在改动确实需要时才运行——否则在大仓库上每轮自检都会是分钟级。
 *
 * @typedef {{
 *   projectType: string,
 *   packageManager?: string,
 *   primaryCommand: string | null,
 *   testCommand: string | null,
 *   buildCommand?: string | null,
 *   allCommands: string[],
 *   description: string,
 * }} VerificationPolicy
 */

/** @returns {any | null} */
function readTsconfig(tsconfigPath) {
  try {
    if (!fs.existsSync(tsconfigPath)) return null
    return JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'))
  } catch {
    return null
  }
}

/** @returns {VerificationPolicy} */
function unknownPolicy(description) {
  return {
    projectType: 'unknown',
    primaryCommand: null,
    testCommand: null,
    buildCommand: null,
    allCommands: [],
    description,
  }
}

/**
 * 自动识别工作区类型的验证与构建命令
 * @param {string | null} workspacePath
 * @returns {VerificationPolicy}
 */
export function detectVerificationCommands(workspacePath) {
  if (!workspacePath) return unknownPolicy('未关联工作区')

  try {
    if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      return unknownPolicy('工作区目录不存在')
    }
  } catch {
    return unknownPolicy('无法访问工作区')
  }

  const packageJsonPath = path.join(workspacePath, 'package.json')
  const tsconfigPath = path.join(workspacePath, 'tsconfig.json')
  const pyprojectPath = path.join(workspacePath, 'pyproject.toml')
  const pytestIniPath = path.join(workspacePath, 'pytest.ini')
  const cargoPath = path.join(workspacePath, 'Cargo.toml')
  const goModPath = path.join(workspacePath, 'go.mod')
  const makefilePath = path.join(workspacePath, 'Makefile')
  const pomPath = path.join(workspacePath, 'pom.xml')
  const gradlePath = path.join(workspacePath, 'build.gradle')
  const gradleKtsPath = path.join(workspacePath, 'build.gradle.kts')

  // 1. Node.js / TypeScript 项目（识别 npm / pnpm / yarn / bun）
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      const hasScript = (name) => typeof scripts[name] === 'string' && scripts[name].trim().length > 0
      const firstScript = (...names) => names.find(hasScript)

      // 检测包管理器
      let pm = 'npm'
      if (fs.existsSync(path.join(workspacePath, 'pnpm-lock.yaml'))) pm = 'pnpm'
      else if (fs.existsSync(path.join(workspacePath, 'yarn.lock'))) pm = 'yarn'
      else if (fs.existsSync(path.join(workspacePath, 'bun.lockb')) || fs.existsSync(path.join(workspacePath, 'bun.lock'))) pm = 'bun'

      // 轻量优先：类型检查 → lint → tsc（按 tsconfig 形态选）→ 完整构建
      const typecheckScript = firstScript('typecheck', 'type-check', 'check:types', 'tsc')
      const lintScript = firstScript('lint', 'lint:check')
      const buildScript = firstScript('build')
      // 测试：聚焦的优先，test:all 这类聚合脚本放最后（可能串行跑几十个套件）
      const testScript = firstScript('test:unit', 'test', 'test:all')

      // solution-style tsconfig（files: [] + references）下 `tsc --noEmit` 什么也不检查，
      // 必须用 `tsc -b` 才会真正跑各子项目；子项目自带 noEmit，不会产出构建物。
      const tsconfig = readTsconfig(tsconfigPath)
      const tscCommand = tsconfig
        ? (Array.isArray(tsconfig.references) && tsconfig.references.length > 0 ? 'npx tsc -b' : 'npx tsc --noEmit')
        : null

      const candidates = []
      if (typecheckScript) candidates.push(`${pm} run ${typecheckScript}`)
      if (lintScript) candidates.push(`${pm} run ${lintScript}`)
      if (!typecheckScript && tscCommand) candidates.push(tscCommand)
      const primaryCommand = candidates[0] ?? (buildScript ? `${pm} run build` : null)

      const testCommand = testScript ? `${pm} run ${testScript}` : null
      const buildCommand = buildScript ? `${pm} run build` : null

      const allCommands = []
      for (const cmd of [primaryCommand, testCommand, buildCommand]) {
        if (cmd && !allCommands.includes(cmd)) allCommands.push(cmd)
      }

      return {
        projectType: fs.existsSync(tsconfigPath) ? 'typescript-node' : 'node',
        packageManager: pm,
        primaryCommand,
        testCommand,
        buildCommand,
        allCommands,
        description: `Node.js (${pm}) 项目 (${pkg.name || '未命名'})`,
      }
    } catch {
      // package.json 解析失败时兜底，继续按其他项目类型探测
    }
  }

  // 2. Python 项目
  if (fs.existsSync(pytestIniPath) || fs.existsSync(pyprojectPath) || fs.existsSync(path.join(workspacePath, 'requirements.txt')) || fs.existsSync(path.join(workspacePath, 'setup.py'))) {
    const hasPytest = fs.existsSync(pytestIniPath) || fs.existsSync(pyprojectPath)
    const primaryCommand = hasPytest ? 'pytest -q --maxfail=1' : 'python -m compileall -q .'
    return {
      projectType: 'python',
      primaryCommand,
      testCommand: primaryCommand,
      buildCommand: null,
      allCommands: [primaryCommand],
      description: 'Python 项目',
    }
  }

  // 3. Rust 项目（cargo check 本身就是轻量档）
  if (fs.existsSync(cargoPath)) {
    return {
      projectType: 'rust',
      primaryCommand: 'cargo check',
      testCommand: 'cargo test',
      buildCommand: 'cargo build',
      allCommands: ['cargo check', 'cargo test', 'cargo build'],
      description: 'Rust (Cargo) 项目',
    }
  }

  // 4. Go 项目
  if (fs.existsSync(goModPath)) {
    return {
      projectType: 'go',
      primaryCommand: 'go vet ./...',
      testCommand: 'go test ./...',
      buildCommand: 'go build ./...',
      allCommands: ['go vet ./...', 'go test ./...', 'go build ./...'],
      description: 'Go 模块项目',
    }
  }

  // 5. Java / Kotlin 项目 (Maven / Gradle)
  if (fs.existsSync(pomPath)) {
    return {
      projectType: 'maven',
      primaryCommand: 'mvn -q test-compile',
      testCommand: 'mvn test',
      buildCommand: 'mvn package',
      allCommands: ['mvn -q test-compile', 'mvn test', 'mvn package'],
      description: 'Java (Maven) 项目',
    }
  }
  if (fs.existsSync(gradlePath) || fs.existsSync(gradleKtsPath)) {
    const gradlew = fs.existsSync(path.join(workspacePath, 'gradlew')) ? './gradlew' : 'gradle'
    return {
      projectType: 'gradle',
      primaryCommand: `${gradlew} testClasses`,
      testCommand: `${gradlew} test`,
      buildCommand: `${gradlew} build`,
      allCommands: [`${gradlew} testClasses`, `${gradlew} test`, `${gradlew} build`],
      description: 'JVM (Gradle) 项目',
    }
  }

  // 6. C/C++ 或通用 Makefile 项目
  if (fs.existsSync(makefilePath)) {
    return {
      projectType: 'make',
      primaryCommand: 'make',
      testCommand: 'make test',
      buildCommand: 'make',
      allCommands: ['make', 'make test'],
      description: 'Makefile 项目',
    }
  }

  return {
    projectType: 'general',
    primaryCommand: null,
    testCommand: null,
    buildCommand: null,
    allCommands: [],
    description: '常规工作区',
  }
}

/**
 * 生成注入给 Agent 的工作区自检指示文本
 * @param {string | null} workspacePath
 */
export function formatVerificationPrompt(workspacePath) {
  const policy = detectVerificationCommands(workspacePath)
  if (!policy || (!policy.primaryCommand && !policy.testCommand)) {
    return `
【工作区验证指引】
当前工作区未检测到标准的自动化构建/测试脚本。在修改代码后：
- 如创建了可执行脚本或独立文件，请使用 \`bash\` 工具主动运行语法检查或轻量验证；
- 严禁假定代码一定正确，若无法执行命令验证，必须在最终交付中如实说明。
`.trim()
  }

  const lines = [
    '【工作区自动识别验证策略】',
    `项目类型：${policy.description}`,
    `轻量自检命令（首选）：${policy.primaryCommand ? `\`${policy.primaryCommand}\`` : '无'}`,
    `测试命令：${policy.testCommand ? `\`${policy.testCommand}\`` : '无'}`,
  ]
  if (policy.buildCommand) {
    lines.push(`完整构建命令（较重，仅在必要时运行）：\`${policy.buildCommand}\``)
  }

  lines.push(
    '',
    '指令要求：',
    '修改任何文件后，请优先运行上面的**轻量自检命令**确认没有引入错误；',
    '只有在改动涉及构建产物、依赖或打包配置时，才运行完整构建命令。',
    '若本次改动无法被上述命令覆盖，请如实说明未执行验证的原因。',
  )

  return lines.join('\n').trim()
}
