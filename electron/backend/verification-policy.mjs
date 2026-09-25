import fs from 'node:fs'
import path from 'node:path'

/**
 * 自动识别工作区类型的验证与构建命令
 * @param {string | null} workspacePath 
 */
export function detectVerificationCommands(workspacePath) {
  if (!workspacePath) {
    return {
      projectType: 'unknown',
      primaryCommand: null,
      testCommand: null,
      allCommands: [],
      description: '未关联工作区',
    }
  }

  try {
    if (!fs.existsSync(workspacePath) || !fs.statSync(workspacePath).isDirectory()) {
      return {
        projectType: 'unknown',
        primaryCommand: null,
        testCommand: null,
        allCommands: [],
        description: '工作区目录不存在',
      }
    }
  } catch {
    return {
      projectType: 'unknown',
      primaryCommand: null,
      testCommand: null,
      allCommands: [],
      description: '无法访问工作区',
    }
  }

  const packageJsonPath = path.join(workspacePath, 'package.json')
  const tsconfigPath = path.join(workspacePath, 'tsconfig.json')
  const pyprojectPath = path.join(workspacePath, 'pyproject.toml')
  const pytestIniPath = path.join(workspacePath, 'pytest.ini')
  const cargoPath = path.join(workspacePath, 'Cargo.toml')
  const goModPath = path.join(workspacePath, 'go.mod')

  // 1. Node.js / TypeScript 项目
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const scripts = pkg.scripts || {}
      const hasBuild = Boolean(scripts.build)
      const hasTestAll = Boolean(scripts['test:all'])
      const hasTest = Boolean(scripts.test)
      const hasLint = Boolean(scripts.lint)
      const hasTypecheck = Boolean(scripts.typecheck || scripts['check:types'])

      let primaryCommand = null
      let testCommand = null
      const allCommands = []

      if (hasBuild) {
        primaryCommand = 'npm run build'
        allCommands.push('npm run build')
      } else if (hasTypecheck) {
        primaryCommand = 'npm run typecheck'
        allCommands.push('npm run typecheck')
      } else if (fs.existsSync(tsconfigPath)) {
        primaryCommand = 'npx tsc --noEmit'
        allCommands.push('npx tsc --noEmit')
      }

      if (hasTestAll) {
        testCommand = 'npm run test:all'
        allCommands.push('npm run test:all')
      } else if (hasTest) {
        testCommand = 'npm test'
        allCommands.push('npm test')
      }

      if (hasLint) {
        allCommands.push('npm run lint')
      }

      return {
        projectType: fs.existsSync(tsconfigPath) ? 'typescript-node' : 'node',
        primaryCommand,
        testCommand,
        allCommands,
        description: `Node.js 项目 (${pkg.name || '未命名'})`,
      }
    } catch {
      // package.json 解析失败时兜底
    }
  }

  // 2. Python 项目
  if (fs.existsSync(pytestIniPath) || fs.existsSync(pyprojectPath) || fs.existsSync(path.join(workspacePath, 'requirements.txt')) || fs.existsSync(path.join(workspacePath, 'setup.py'))) {
    const hasPytest = fs.existsSync(pytestIniPath) || fs.existsSync(pyprojectPath)
    return {
      projectType: 'python',
      primaryCommand: hasPytest ? 'pytest' : 'python -m unittest',
      testCommand: hasPytest ? 'pytest' : 'python -m unittest',
      allCommands: [hasPytest ? 'pytest' : 'python -m unittest'],
      description: 'Python 项目',
    }
  }

  // 3. Rust 项目
  if (fs.existsSync(cargoPath)) {
    return {
      projectType: 'rust',
      primaryCommand: 'cargo check',
      testCommand: 'cargo test',
      allCommands: ['cargo check', 'cargo test'],
      description: 'Rust (Cargo) 项目',
    }
  }

  // 4. Go 项目
  if (fs.existsSync(goModPath)) {
    return {
      projectType: 'go',
      primaryCommand: 'go test ./...',
      testCommand: 'go test ./...',
      allCommands: ['go test ./...'],
      description: 'Go 模块项目',
    }
  }

  return {
    projectType: 'general',
    primaryCommand: null,
    testCommand: null,
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

  const commandsText = policy.allCommands.map((cmd) => `  * \`${cmd}\``).join('\n')

  return `
【工作区自动识别验证策略】
项目类型：${policy.description}
推荐构建/验证命令：${policy.primaryCommand ? `\`${policy.primaryCommand}\`` : '无'}
推荐测试命令：${policy.testCommand ? `\`${policy.testCommand}\`` : '无'}
可用验证命令集合：
${commandsText}

指令要求：
在修改任何文件后，你必须优先调用 \`bash\` 工具运行上述推荐验证命令（例如 \`${policy.primaryCommand || policy.testCommand}\`）。若验证报错，自动阅读 stderr 进入自愈循环。
`.trim()
}
