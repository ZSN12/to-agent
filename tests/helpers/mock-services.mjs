import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'

/**
 * Mock DSH session for testing multi-session scenarios
 */
export class MockDshSession extends EventEmitter {
  constructor(sessionId = randomUUID()) {
    super()
    this.sessionId = sessionId
    this.state = 'ready'
    this.messages = []
    this.toolCalls = []
    this.connected = true
  }

  async sendMessage(content) {
    if (!this.connected) {
      throw new Error('Session disconnected')
    }
    const message = { role: 'user', content, timestamp: Date.now() }
    this.messages.push(message)
    this.emit('message', message)
    return message
  }

  async executeToolCall(toolName, input) {
    const call = { toolName, input, timestamp: Date.now(), sessionId: this.sessionId }
    this.toolCalls.push(call)
    this.emit('tool-call', call)
    return { success: true, result: `mock-result-${toolName}` }
  }

  disconnect() {
    this.connected = false
    this.state = 'disconnected'
    this.emit('disconnect')
  }

  reconnect() {
    this.connected = true
    this.state = 'ready'
    this.emit('reconnect')
  }

  getIsolationState() {
    return {
      sessionId: this.sessionId,
      toolCalls: this.toolCalls.length,
      messages: this.messages.length,
      state: this.state,
    }
  }
}

/**
 * Mock permission service for testing approval flows
 */
export class MockPermissionService {
  constructor() {
    this.pendingPrompts = []
    this.approvals = []
    this.denials = []
    this.autoApprove = false
  }

  async requestPermission(toolCall, context) {
    const prompt = {
      id: randomUUID(),
      toolCall,
      context,
      timestamp: Date.now(),
      status: 'pending',
    }
    this.pendingPrompts.push(prompt)

    if (this.autoApprove) {
      return this.approve(prompt.id)
    }

    return new Promise((resolve) => {
      prompt.resolve = resolve
    })
  }

  approve(promptId, options = {}) {
    const prompt = this.pendingPrompts.find((p) => p.id === promptId)
    if (!prompt) throw new Error(`Prompt ${promptId} not found`)

    prompt.status = 'approved'
    prompt.options = options
    this.approvals.push(prompt)

    if (prompt.resolve) {
      prompt.resolve({ approved: true, options })
    }

    return { approved: true, options }
  }

  deny(promptId, reason = 'User denied') {
    const prompt = this.pendingPrompts.find((p) => p.id === promptId)
    if (!prompt) throw new Error(`Prompt ${promptId} not found`)

    prompt.status = 'denied'
    prompt.reason = reason
    this.denials.push(prompt)

    if (prompt.resolve) {
      prompt.resolve({ approved: false, reason })
    }

    return { approved: false, reason }
  }

  getPendingCount() {
    return this.pendingPrompts.filter((p) => p.status === 'pending').length
  }

  reset() {
    this.pendingPrompts = []
    this.approvals = []
    this.denials = []
  }
}

/**
 * Mock orchestration service for testing DAG execution
 */
export class MockOrchestrationService {
  constructor() {
    this.executedTasks = []
    this.taskResults = new Map()
  }

  async executeTask(task) {
    this.executedTasks.push({ ...task, timestamp: Date.now() })

    // Simulate task execution
    const result = {
      taskId: task.id,
      status: 'completed',
      output: `mock-output-${task.id}`,
    }

    this.taskResults.set(task.id, result)
    return result
  }

  getExecutionOrder() {
    return this.executedTasks.map((t) => t.id)
  }

  getTaskResult(taskId) {
    return this.taskResults.get(taskId)
  }

  reset() {
    this.executedTasks = []
    this.taskResults.clear()
  }
}

/**
 * Create a mock workspace for testing
 */
export function createMockWorkspace(basePath = '/tmp/test-workspace') {
  return {
    path: basePath,
    files: new Map(),
    sessions: new Map(),

    addFile(filePath, content) {
      this.files.set(filePath, content)
    },

    getFile(filePath) {
      return this.files.get(filePath)
    },

    addSession(sessionId, session) {
      this.sessions.set(sessionId, session)
    },

    getSession(sessionId) {
      return this.sessions.get(sessionId)
    },

    reset() {
      this.files.clear()
      this.sessions.clear()
    },
  }
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(condition, { timeout = 5000, interval = 100 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await condition()) return true
    await new Promise((resolve) => setTimeout(resolve, interval))
  }
  throw new Error(`waitFor timeout after ${timeout}ms`)
}
