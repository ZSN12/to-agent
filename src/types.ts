export type TaskStatus = 'done' | 'running' | 'queued' | 'review'

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'

export interface ModelOption {
  id: string
  name: string
  quality: string
  reasoning?: boolean
  thinkingLevel?: ThinkingLevel
}

export interface ChatMessage {
  id: string
  author: 'user' | 'orchestrator' | 'agent'
  name: string
  time: string
  timestamp?: number
  text: string
  thinking?: string
  thinkingDurationMs?: number
  modelKey?: string
  callout?: string
  usage?: ChatUsage
  behavior?: 'steer' | 'followUp'
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  costUsd: number
  elapsedMs: number
  tokensPerSecond: number
  contextTokens: number | null
  contextWindow: number | null
  contextPercent: number | null
}

export interface TaskNode {
  id: string
  title: string
  role: string
  model: string
  tier: 'low' | 'balanced' | 'high' | 'deterministic'
  status: TaskStatus
  statusLabel: string
  duration: string
  description: string
  detail: string
  reasons: string[]
  confidence: string
  messages: ChatMessage[]
  x: number
  y: number
  taskType?: 'research' | 'implementation' | 'test' | 'review'
  dependsOn?: string[]
  modelKey?: string
  routeReason?: string
  toolProfile?: 'read-only' | 'verification' | 'workspace-write'
  error?: string
}
