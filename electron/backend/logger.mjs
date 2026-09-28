import fs from 'node:fs/promises'
import path from 'node:path'
import { createWriteStream } from 'node:fs'

const LOG_LEVELS = {
  ERROR: { value: 0, label: 'ERROR', color: '\x1b[31m' },
  WARN: { value: 1, label: 'WARN', color: '\x1b[33m' },
  INFO: { value: 2, label: 'INFO', color: '\x1b[36m' },
  DEBUG: { value: 3, label: 'DEBUG', color: '\x1b[90m' },
}

const RESET_COLOR = '\x1b[0m'
const MAX_LOG_SIZE = 10 * 1024 * 1024
const MAX_LOG_FILES = 5

function formatTimestamp() {
  const now = new Date()
  return now.toISOString()
}

function formatLogEntry(level, module, message, stack) {
  const timestamp = formatTimestamp()
  const entry = {
    timestamp,
    level: level.label,
    module,
    message,
  }
  if (stack) {
    entry.stack = stack
  }
  return entry
}

function formatConsoleOutput(level, module, message, stack) {
  const timestamp = formatTimestamp()
  const coloredLevel = `${level.color}${level.label.padEnd(5)}${RESET_COLOR}`
  const moduleStr = module ? `[${module}]` : ''
  let output = `${timestamp} ${coloredLevel} ${moduleStr} ${message}`
  if (stack) {
    output += `\n${stack}`
  }
  return output
}

class Logger {
  constructor(logDir, logLevel = 'INFO') {
    this.logDir = logDir
    this.logLevel = LOG_LEVELS[logLevel] || LOG_LEVELS.INFO
    this.logFilePath = null
    this.writeStream = null
    this.initialized = false
    this.pendingLogs = []
  }

  async initialize() {
    if (this.initialized) return

    try {
      await fs.mkdir(this.logDir, { recursive: true })
      this.logFilePath = path.join(this.logDir, 'taskweaver.log')
      await this.rotateIfNeeded()
      this.writeStream = createWriteStream(this.logFilePath, { flags: 'a', encoding: 'utf8' })
      this.initialized = true

      for (const entry of this.pendingLogs) {
        this.writeStream.write(entry)
      }
      this.pendingLogs = []
    } catch (error) {
      console.error('初始化日志系统失败:', error)
    }
  }

  async rotateIfNeeded() {
    try {
      const stats = await fs.stat(this.logFilePath)
      if (stats.size >= MAX_LOG_SIZE) {
        await this.rotateLogs()
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  async rotateLogs() {
    if (!this.logFilePath) return

    for (let i = MAX_LOG_FILES - 1; i > 0; i--) {
      const oldPath = `${this.logFilePath}.${i}`
      const newPath = `${this.logFilePath}.${i + 1}`
      try {
        await fs.rename(oldPath, newPath)
      } catch (error) {
        if (error && typeof error === 'object' && error.code !== 'ENOENT') {
          console.error(`日志轮转失败 ${oldPath} -> ${newPath}:`, error)
        }
      }
    }

    try {
      await fs.rename(this.logFilePath, `${this.logFilePath}.1`)
    } catch (error) {
      if (error && typeof error === 'object' && error.code !== 'ENOENT') {
        console.error(`日志轮转失败 ${this.logFilePath}:`, error)
      }
    }
  }

  log(level, module, message, error) {
    if (level.value > this.logLevel.value) return

    const stack = error instanceof Error ? error.stack : undefined
    const logEntry = formatLogEntry(level, module, message, stack)
    const consoleOutput = formatConsoleOutput(level, module, message, stack)

    if (level.value <= LOG_LEVELS.WARN.value) {
      console.error(consoleOutput)
    } else {
      console.log(consoleOutput)
    }

    const logLine = `${JSON.stringify(logEntry)}\n`

    if (this.initialized && this.writeStream) {
      this.writeStream.write(logLine)
    } else {
      this.pendingLogs.push(logLine)
      if (!this.initialized) {
        this.initialize().catch((err) => {
          console.error('延迟初始化日志系统失败:', err)
        })
      }
    }
  }

  error(module, message, error) {
    this.log(LOG_LEVELS.ERROR, module, message, error)
  }

  warn(module, message, error) {
    this.log(LOG_LEVELS.WARN, module, message, error)
  }

  info(module, message) {
    this.log(LOG_LEVELS.INFO, module, message)
  }

  debug(module, message) {
    this.log(LOG_LEVELS.DEBUG, module, message)
  }

  async close() {
    if (this.writeStream) {
      return new Promise((resolve) => {
        this.writeStream.end(() => {
          this.writeStream = null
          this.initialized = false
          resolve()
        })
      })
    }
  }
}

let globalLogger = null

export function createLogger(logDir, logLevel) {
  return new Logger(logDir, logLevel)
}

export function initializeGlobalLogger(logDir, logLevel = 'INFO') {
  globalLogger = new Logger(logDir, logLevel)
  globalLogger.initialize().catch((err) => {
    console.error('全局日志系统初始化失败:', err)
  })
  return globalLogger
}

export const logger = {
  error(module, message, error) {
    if (globalLogger) {
      globalLogger.error(module, message, error)
    } else {
      console.error(`[${module}] ${message}`, error)
    }
  },
  warn(module, message, error) {
    if (globalLogger) {
      globalLogger.warn(module, message, error)
    } else {
      console.warn(`[${module}] ${message}`, error)
    }
  },
  info(module, message) {
    if (globalLogger) {
      globalLogger.info(module, message)
    } else {
      console.log(`[${module}] ${message}`)
    }
  },
  debug(module, message) {
    if (globalLogger) {
      globalLogger.debug(module, message)
    } else {
      console.log(`[${module}] ${message}`)
    }
  },
}
