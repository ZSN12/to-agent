import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5MB 轮转阈值
const MAX_BACKUP_FILES = 5

function maskSecretString(input) {
  if (typeof input !== 'string') return input
  let sanitized = input

  // 1. sk- 格式 Key
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9_-]{16,}/g, (match) => {
    return `${match.slice(0, 5)}******${match.slice(-4)}`
  })

  // 2. Google AIza Key
  sanitized = sanitized.replace(/AIza[0-9A-Za-z-_]{30,}/g, (match) => {
    return `${match.slice(0, 6)}******${match.slice(-4)}`
  })

  // 3. Bearer Token
  sanitized = sanitized.replace(/Bearer\s+([a-zA-Z0-9_\-\.]{16,})/gi, (match, token) => {
    return `Bearer ${token.slice(0, 4)}******${token.slice(-4)}`
  })

  // 4. 键值对密码/凭据
  sanitized = sanitized.replace(
    /((?:api[_-]?key|password|token|secret|authorization)["']?\s*[:=]\s*["']?)([^"' \s\n\r]{6,})(["']?)/gi,
    (_, prefix, secret, suffix) => `${prefix}******${suffix}`
  )

  // 脱敏宿主机绝对主目录
  const homedir = os.homedir()
  if (homedir && sanitized.includes(homedir)) {
    sanitized = sanitized.replaceAll(homedir, '~')
  }

  return sanitized
}

function sanitizeLogArgs(args) {
  return args.map((arg) => {
    if (arg instanceof Error) {
      return maskSecretString(arg.stack || arg.message)
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        const json = JSON.stringify(arg, (key, value) => {
          if (typeof key === 'string' && /key|token|secret|password|credential/i.test(key) && typeof value === 'string') {
            return value.length > 8 ? `${value.slice(0, 3)}***${value.slice(-3)}` : '******'
          }
          return value
        })
        return maskSecretString(json)
      } catch {
        return '[Unserializable Object]'
      }
    }
    return maskSecretString(String(arg))
  })
}

function resolveDefaultLogDir() {
  if (process.env.TASKWEAVER_USER_DATA) {
    return path.join(process.env.TASKWEAVER_USER_DATA, 'logs')
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Logs', 'taskweaver-desktop')
  }
  return path.join(os.homedir(), '.taskweaver', 'logs')
}

export class LoggerService {
  constructor({ logDir = null, consoleOutput = true } = {}) {
    this.logDir = logDir || resolveDefaultLogDir()
    this.currentLogPath = path.join(this.logDir, 'taskweaver.log')
    this.consoleOutput = consoleOutput
    this.stream = null
    this.currentSize = 0

    this.ensureLogDir()
  }

  ensureLogDir() {
    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true })
      }
      if (!fs.existsSync(this.currentLogPath)) {
        fs.writeFileSync(this.currentLogPath, '', 'utf8')
      }
      const stat = fs.statSync(this.currentLogPath)
      this.currentSize = stat.size
      this.stream = fs.createWriteStream(this.currentLogPath, { flags: 'a', encoding: 'utf8' })
    } catch {
      // 降级为纯终端输出
      this.stream = null
    }
  }

  rotateLogs() {
    try {
      if (this.stream) {
        this.stream.end()
        this.stream = null
      }

      // 依次后移旧备份文件 taskweaver.N.log -> taskweaver.N+1.log
      for (let i = MAX_BACKUP_FILES - 1; i >= 1; i--) {
        const oldFile = path.join(this.logDir, `taskweaver.${i}.log`)
        const newFile = path.join(this.logDir, `taskweaver.${i + 1}.log`)
        if (fs.existsSync(oldFile)) {
          if (i === MAX_BACKUP_FILES - 1 && fs.existsSync(newFile)) {
            fs.unlinkSync(newFile)
          }
          fs.renameSync(oldFile, newFile)
        }
      }

      // 将当前文件移动为 .1.log
      const backupFirst = path.join(this.logDir, 'taskweaver.1.log')
      if (fs.existsSync(this.currentLogPath)) {
        fs.renameSync(this.currentLogPath, backupFirst)
      }

      this.currentSize = 0
      this.stream = fs.createWriteStream(this.currentLogPath, { flags: 'a', encoding: 'utf8' })
    } catch (err) {
      if (this.consoleOutput) {
        console.error('[LoggerService] 日志轮转异常:', err)
      }
    }
  }

  writeEntry(level, tag, args) {
    const timestamp = new Date().toISOString()
    const sanitizedArgs = sanitizeLogArgs(args)
    const logLine = `[${timestamp}] [${level.toUpperCase()}] [${tag || 'App'}] ${sanitizedArgs.join(' ')}\n`

    if (this.consoleOutput) {
      if (level === 'error') console.error(logLine.trimEnd())
      else if (level === 'warn') console.warn(logLine.trimEnd())
      else console.log(logLine.trimEnd())
    }

    if (this.stream) {
      const lineBytes = Buffer.byteLength(logLine, 'utf8')
      if (this.currentSize + lineBytes > MAX_FILE_SIZE_BYTES) {
        this.rotateLogs()
      }
      this.stream.write(logLine)
      this.currentSize += lineBytes
    }
  }

  forTag(tag) {
    return {
      debug: (...args) => this.writeEntry('debug', tag, args),
      info: (...args) => this.writeEntry('info', tag, args),
      warn: (...args) => this.writeEntry('warn', tag, args),
      error: (...args) => this.writeEntry('error', tag, args),
    }
  }

  /**
   * 一键导出系统诊断包：用于答辩展示与故障排查
   */
  async exportDiagnosticsBundle({ appVersion = '1.2.0', activeState = {} } = {}) {
    const recentLogs = []
    try {
      if (fs.existsSync(this.currentLogPath)) {
        const content = await fs.promises.readFile(this.currentLogPath, 'utf8')
        const lines = content.split('\n').filter(Boolean)
        recentLogs.push(...lines.slice(-300)) // 保留最近 300 条
      }
    } catch {
      // ignore
    }

    return {
      exportedAt: new Date().toISOString(),
      platform: {
        os: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        freeMemMb: Math.round(os.freemem() / (1024 * 1024)),
        totalMemMb: Math.round(os.totalmem() / (1024 * 1024)),
      },
      appVersion,
      activeStateSummary: activeState,
      logStats: {
        currentSizeBytes: this.currentSize,
        logDir: maskSecretString(this.logDir),
        recentLinesCount: recentLogs.length,
      },
      recentLogs,
    }
  }
}

// 导出全局单例
let globalLoggerInstance = null
export function getAppLogger(options) {
  if (!globalLoggerInstance) {
    globalLoggerInstance = new LoggerService(options)
  }
  return globalLoggerInstance
}
