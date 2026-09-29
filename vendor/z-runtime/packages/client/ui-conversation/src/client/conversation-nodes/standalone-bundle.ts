/**
 * TaskWeaver / headless clients: Conversation Node definitions without Cordis.
 * Web plugin `register.ts` should register the same objects via ctx.
 */
import type { ConversationNodeDefinition, ConversationViewDefinition } from '@z/dsh-client-runtime/client'
import { assistantDefinition } from './assistant.ts'
import { chatViewDefinition } from './chat-snapshot-builder.ts'
import { commandDefinition } from './command.ts'
import { compactionDefinition } from './compaction.ts'
import { unknownFallbackDefinition } from './fallback.ts'
import { nextStepInboxDefinition, nextTurnInboxDefinition } from './inbox.ts'
import { messageDefinition } from './message.ts'
import { retryDefinition } from './retry.ts'
import { toolDefinition } from './tool.ts'
import { turnErrorDefinition } from './turn-error.ts'
import { turnMaxTokensDefinition } from './turn-max-tokens.ts'
import { turnTailDefinition } from './turn-tail.ts'

/** Ordinary chat event definitions in registration order. */
export const TASKWEAVER_CHAT_EVENT_DEFINITIONS: readonly ConversationNodeDefinition[] = [
  nextTurnInboxDefinition,
  nextStepInboxDefinition,
  messageDefinition,
  assistantDefinition,
  toolDefinition,
  commandDefinition,
  compactionDefinition,
  retryDefinition,
  turnErrorDefinition,
  turnMaxTokensDefinition,
  turnTailDefinition,
]

export const TASKWEAVER_CHAT_FALLBACK: ConversationNodeDefinition = unknownFallbackDefinition

export const TASKWEAVER_CHAT_VIEW_DEFINITIONS: readonly ConversationViewDefinition[] = [
  chatViewDefinition,
]
