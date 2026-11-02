import { createHash, randomUUID } from 'node:crypto'
import { appendUserChatEntry } from './message-factory.mjs'
import { redactToolOutput } from './tool-trace.mjs'
import { resolveCollaborationPlan, buildStagePromptContext, parseReviewResult } from './role-collaboration-router.mjs'

const MAX_ROLE_PARTICIPANTS = 5
const MAX_ROLE_TOOL_CALLS = 12
const ROLE_REPLY_CONTEXT_CHARS = 6_000
const ROLE_HISTORY_CONTEXT_CHARS = 10_000
const MAX_ROLE_ERROR_CHARS = 800
const MAX_ROLE_DIFF_CHARS = 12_000
const MAX_ROLE_TEST_RUNS = 8
const MAX_ROLE_TEST_OUTPUT_CHARS = 1_200

const ROLE_STYLE_GUIDANCE = {
  precise: '表达风格：严谨工程。先给结论，再列依据、边界和验证办法；不确定时明确标注，不编造事实。',
  concise: '表达风格：极简直接。优先给可执行答案，压缩铺垫；涉及风险或不确定性时仍须说明。',
  playful: '表达风格：轻松机敏、适度幽默。保持准确、尊重和任务导向，不为玩笑牺牲技术严谨。',
}

const ROLE_TASK_GUIDANCE = '角色设定只用于选择分析视角、专业方法和表达风格。除非用户直接询问，不要自我介绍、提及角色标签、其他 Bot 或它们后续要做的工作。避免模板化问候、重复总结和“随时待命”等无关收尾；直接完成当前任务。'

function buildRolePersona(profile) {
  const guidance = ROLE_STYLE_GUIDANCE[profile.stylePreset]
  return [profile.persona.trim(), guidance, ROLE_TASK_GUIDANCE].filter(Boolean).join('\n\n')
}

function emitRoleProgress(webContents, conversationId, event) {
  if (!webContents || webContents.isDestroyed?.() || typeof webContents.send !== 'function') return
  try {
    webContents.send('chat:stream', { type: 'role_progress', conversationId, ...event })
  } catch {
    // A closing renderer must not interrupt a durable role turn.
  }
}

function roleSessionKey(profile, conversationId, agentPreset = 'tw-default') {
  const conversationHash = createHash('sha256').update(conversationId).digest('hex').slice(0, 16)
  const personaHash = createHash('sha256').update(profile.persona).digest('hex').slice(0, 20)
  const presetSuffix = agentPreset === 'tw-taskweaver-readonly' ? 'readonly' : 'default'
  return `tw-role-${profile.id}-${conversationHash}-${personaHash}-${presetSuffix}`
}

function buildRolePrompt(userText, priorReplies, sharedContext, discussionStrategy = 'relay') {
  const sections = [
    '请以当前角色身份回应用户。',
    `本轮工具调用预算为 ${MAX_ROLE_TOOL_CALLS} 次；优先合并检索和读取，避免重复调用。`,
    '【校验边界】如果使用模 9、估算、抽样或其他一致性检查，必须说明它只能发现部分错误、不能单独证明结论完全正确；将筛查结果与精确推导分开表述。',
  ]
  if (discussionStrategy === 'independent') {
    sections.push('本轮采用独立回答：只根据用户问题和既有对话背景形成自己的判断，不参考、猜测或复述本轮其他 Bot 的回答。')
  }
  if (priorReplies.length) {
    sections.push(`【本轮其他角色已发表的意见】\n${priorReplies.map(({ name, text }) => `${name}：\n${text.slice(0, ROLE_REPLY_CONTEXT_CHARS)}`).join('\n\n')}`)
    sections.push('这是接力讨论。请先形成自己的判断，再针对前序意见提供实质性的补充、修正或分歧；不要用“我同意”“正如前面所说”等附和句开头，也不要复述已有内容。没有新信息时，简短说明“本轮无额外补充”，不要为了凑字数重复观点。')
  }
  if (sharedContext) sections.push(`【当前对话的近期记录】\n${sharedContext}`)
  sections.push(`【用户消息】\n${userText}`)
  return sections.join('\n\n')
}

function buildSummaryPrompt(userText, replies, sharedContext) {
  const sections = [
    '请作为本轮主持 Bot 汇总其他 Bot 对用户问题的回答。只归纳已提供的内容，不要补造事实或把未验证的意见写成结论。',
    '用简洁自然的中文给出：共识、主要分歧或风险、可执行的综合建议。若没有分歧就不必硬凑；避免逐段复述。',
    '如果引用模 9、估算、抽样或其他一致性检查，必须说明它只能发现部分错误、不能单独证明结论完全正确。',
    `【用户消息】\n${userText}`,
    `【本轮 Bot 回答】\n${replies.map(({ name, text }) => `${name}：\n${text.slice(0, ROLE_REPLY_CONTEXT_CHARS)}`).join('\n\n')}`,
  ]
  if (sharedContext) sections.splice(3, 0, `【当前对话背景】\n${sharedContext}`)
  return sections.join('\n\n')
}

function addRoleCorrections(text, corrections) {
  if (corrections.length === 0) return text
  const notes = corrections.map(({ text: correction }, index) => `${index + 1}. ${correction}`).join('\n')
  return `${text}\n\n【用户在本轮执行中的纠偏】\n${notes}`
}

function conversationContext(messages, activeSteeringMessages = []) {
  const activeSteeringText = new Set(activeSteeringMessages.map((correction) => correction.text))
  const turns = (Array.isArray(messages) ? messages : [])
    .filter((message) => !(message?.roleMode && message.behavior === 'steer' && activeSteeringText.has(message.text)))
    .filter((message) => (message?.author === 'user' || message?.author === 'orchestrator' || message?.author === 'agent')
      && typeof message.text === 'string' && message.text.trim())
    .slice(-12)
    .map((message) => `${message.name || (message.author === 'user' ? '你' : 'TaskWeaver')}：\n${message.text.slice(0, 2_000)}`)
  let remaining = ROLE_HISTORY_CONTEXT_CHARS
  const bounded = []
  for (let index = turns.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const turn = turns[index].slice(-remaining)
    bounded.unshift(turn)
    remaining -= turn.length
  }
  return bounded.join('\n\n')
}

function isSensitiveDiffPath(filePath) {
  const normalized = String(filePath ?? '').replace(/\\/g, '/').replace(/^"|"$/g, '').toLowerCase()
  return /(?:^|\/)(?:\.env(?:\.[^/]*)?|secrets?(?:\/|\.|$)|credentials?(?:\/|\.|$)|id_rsa(?:\.[^/]*)?|id_ed25519(?:\.[^/]*)?|[^/]+\.(?:pem|p12|pfx|key|cert|crt))/.test(normalized)
    || /(?:^|[._-])(?:api[-_]?key|access[-_]?token|client[-_]?secret|credential)(?:[._-]|$)/.test(normalized)
}

function filterSensitiveDiff(diff) {
  const chunks = String(diff ?? '').split(/(?=^diff --git )/m).filter(Boolean)
  if (!chunks.length) return ''
  return chunks.filter((chunk) => {
    const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(chunk)
    const filePath = header?.[1] ?? /^\+\+\+ b\/(.+)$/m.exec(chunk)?.[1] ?? ''
    return !isSensitiveDiffPath(filePath)
  }).join('')
}

function isTestCommand(command) {
  return /(?:\b(?:pnpm|npm|yarn|bun)\s+(?:run\s+)?(?:test|vitest|jest|playwright|typecheck|lint|check(?::[\w-]+)?)\b|\bpnpm\s+test\b|\b(?:vitest|jest|pytest|tox|cargo\s+test|go\s+test)\b|\b(?:node|tsx)\s+(?:--import\s+[^\s]+\s+)?[^;\n]{0,180}\btest[^\s]*\.(?:mjs|cjs|js|ts|tsx)\b)/i.test(command)
}

function changedFilesFromTurn(result) {
  const paths = new Set()
  for (const file of Array.isArray(result?.fileChanges) ? result.fileChanges : []) {
    if (typeof file?.path === 'string' && file.path && !isSensitiveDiffPath(file.path)) paths.add(file.path)
  }
  for (const detail of result?.turnActivity?.details ?? []) {
    const filePath = detail?.fileDiff?.path
    if (typeof filePath === 'string' && filePath && !isSensitiveDiffPath(filePath)) paths.add(filePath)
  }
  return [...paths].slice(0, 100)
}

async function collectImplementationEvidence({ result, checkpoint, conversationId, workspacePath, getGitCheckpointDiff, userDataPath, chat }) {
  let diff = ''
  let diffStat = ''
  let diffSource = 'none'
  const notes = []
  if (checkpoint?.id && typeof getGitCheckpointDiff === 'function') {
    try {
      const snapshot = await getGitCheckpointDiff(workspacePath, checkpoint.id, { conversationId, userDataPath })
      diff = redactToolOutput(filterSensitiveDiff(snapshot?.diff)).slice(0, MAX_ROLE_DIFF_CHARS)
      diffStat = String(snapshot?.stat ?? '').slice(0, 2_000)
      diffSource = 'git-checkpoint-diff'
      notes.push('差量以实施前检查点为基线，可能包含实施期间由用户或其他进程并发产生的工作区变化。')
      if (!snapshot?.includesUntrackedFiles) notes.push('当前运行时未确认未跟踪文件是否纳入差量。')
    } catch (error) {
      notes.push(`Git 差量采集失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!diff) {
    const toolDiffs = (result?.turnActivity?.details ?? [])
      .filter((detail) => typeof detail?.fileDiff?.diff === 'string' && detail.fileDiff.diff.trim())
      .filter((detail) => !isSensitiveDiffPath(detail.fileDiff.path))
      .slice(0, 20)
      .map((detail) => `--- ${detail.fileDiff.path}\n${detail.fileDiff.diff}`)
    if (toolDiffs.length) {
      diff = redactToolOutput(toolDiffs.join('\n\n')).slice(0, MAX_ROLE_DIFF_CHARS)
      diffSource = 'host-file-tool-diff'
      notes.push('此工作区没有可用 Git 基准；仅包含 Host 捕获到的 edit/write 文件差量，shell 直接改写和未捕获变更不在其中。')
    } else if (!checkpoint?.id) {
      notes.push('没有 Git 检查点且 Host 未提供文件 patch，无法核实完整代码差量。')
    }
  }

  const testRuns = []
  for (const detail of result?.turnActivity?.details ?? []) {
    if (typeof detail?.commandSummary !== 'string' || !isTestCommand(detail.commandSummary)) continue
    let outputTail = typeof detail.commandOutputTail === 'string' ? detail.commandOutputTail : ''
    if (!outputTail && detail.outputId && typeof chat.getToolOutput === 'function') {
      const stored = chat.getToolOutput({ conversationId, outputId: detail.outputId })
      if (typeof stored?.text === 'string') outputTail = stored.text.slice(-MAX_ROLE_TEST_OUTPUT_CHARS)
    }
    testRuns.push({
      command: detail.commandSummary,
      exitCode: Number.isInteger(detail.commandOutcome?.exitCode) ? detail.commandOutcome.exitCode : null,
      timedOut: detail.commandOutcome?.timedOut === true,
      sandboxDenied: detail.commandOutcome?.sandboxDenied === true,
      outputTail: outputTail.slice(-MAX_ROLE_TEST_OUTPUT_CHARS),
    })
    if (testRuns.length >= MAX_ROLE_TEST_RUNS) break
  }

  if (!testRuns.length) notes.push('没有从 Host 工具事件中检测到带终态记录的测试命令；实施者的文字自述不能替代测试证据。')
  return {
    checkpointId: checkpoint?.id ?? null,
    diffSource,
    diffStat,
    diff,
    changedFiles: changedFilesFromTurn(result),
    testRuns,
    note: notes.join(' '),
  }
}

/** Runs one or more user-defined roles against their own durable DSH sessions. */
export function createRoleChatService({
  roleProfileStore,
  profileStore,
  resolveModelKeyForChat,
  chat,
  appState,
  permissions,
  persistNativeTurn,
  createGitCheckpoint,
  getGitCheckpointDiff,
  userDataPath,
}) {
  const activeTurns = new Map()

  async function send({
    webContents,
    conversationId,
    text,
    roleIds,
    discussionStrategy = 'relay',
    summarize = false,
    runtimeContext,
    attachments = null,
    documents = null,
  }) {
    if (!conversationId) throw new Error('当前对话标识无效')
    if (!Array.isArray(roleIds) || roleIds.length < 1 || roleIds.length > MAX_ROLE_PARTICIPANTS) {
      throw new Error(`角色模式每轮需要选择 1 到 ${MAX_ROLE_PARTICIPANTS} 个角色`)
    }
    if (new Set(roleIds).size !== roleIds.length || roleIds.some((id) => typeof id !== 'string' || !id)) {
      throw new Error('角色列表不能重复或包含无效标识')
    }
    if (discussionStrategy !== 'relay' && discussionStrategy !== 'independent') {
      throw new Error('Bot 讨论策略无效')
    }
    if (typeof summarize !== 'boolean') throw new Error('Bot 汇总选项无效')
    if (summarize && roleIds.length < 2) throw new Error('主 Bot 汇总至少需要选择两个角色')
    if (text != null && typeof text !== 'string') throw new Error('消息内容无效')
    if ((!text || !text.trim())
      && (!Array.isArray(attachments) || attachments.length === 0)
      && (!Array.isArray(documents) || documents.length === 0)) {
      throw new Error('消息不能为空')
    }
    if (activeTurns.has(conversationId)) throw new Error('该会话的角色任务仍在处理中')

    const controller = new AbortController()
    const activeTurn = {
      controller,
      webContents,
      runtimeContext,
      activeSessions: new Map(),
      steeringMessages: [],
      pendingProfileCalls: roleIds.length + (summarize ? 1 : 0),
      cancelPromise: null,
      rollbackCheckpoint: null,
    }
    // Claim the conversation before the first await. IPC currently serializes
    // sends too, but the service must remain single-writer when called directly
    // (or from another future entry point).
    activeTurns.set(conversationId, activeTurn)
    let userEntry
    const assistants = []
    const roleErrors = []
    const successfulReplies = new Map()
    const pipelineAudit = {
      stages: [],
      reviewStatus: null,
      repairAttempts: 0,
      rollbackCheckpoint: null,
      evidence: null,
    }
    let checkpointAttempted = false
    let rolePipelineApplied = false

    const ensureImplementationCheckpoint = async () => {
      if (checkpointAttempted) return activeTurn.rollbackCheckpoint
      checkpointAttempted = true
      if (typeof createGitCheckpoint !== 'function') {
        activeTurn.rollbackCheckpoint = { available: false, reason: '未配置 Git 检查点服务' }
        return activeTurn.rollbackCheckpoint
      }
      try {
        const result = await createGitCheckpoint(runtimeContext.workspacePath, {
          conversationId,
          summary: '多 Bot 代码实施前安全检查点',
          userDataPath,
        })
        if (result?.ok && result.checkpoint?.id) {
          activeTurn.rollbackCheckpoint = { available: true, id: result.checkpoint.id }
        } else if (result?.isRepo === false) {
          activeTurn.rollbackCheckpoint = { available: false, reason: '当前工作区不是 Git 仓库' }
        } else {
          activeTurn.rollbackCheckpoint = {
            available: false,
            reason: result?.error || 'Git 检查点创建失败',
            blocking: true,
          }
        }
      } catch (error) {
        activeTurn.rollbackCheckpoint = {
          available: false,
          reason: error instanceof Error ? error.message : String(error),
          blocking: true,
        }
      }
      pipelineAudit.rollbackCheckpoint = activeTurn.rollbackCheckpoint
      return activeTurn.rollbackCheckpoint
    }

    try {
      const profiles = await Promise.all(roleIds.map((id) => roleProfileStore.get(id)))
      if (profiles.some((profile) => !profile)) throw new Error('所选角色不存在或已删除，请刷新角色列表')
      const previousState = await appState.getConversationState?.(conversationId)
      const sharedContext = conversationContext(
        previousState?.messages,
        activeTurn.steeringMessages,
      )
      if (controller.signal.aborted) return { user: null, assistants, roleErrors }
      const appended = await appendUserChatEntry(text ?? '', conversationId, {
        appState,
        roleMode: true,
        roleDiscussionStrategy: discussionStrategy,
        roleSummaryRequested: summarize,
      })
      userEntry = appended.userEntry

      const runProfile = async (profile, {
        priorReplies = [], summary = false, stage = null, stageLabel = null, priorStageOutputs = [],
        repairFeedback = null, evidence = null,
      } = {}) => {
        if (controller.signal.aborted) return { ok: false, text: '' }
        activeTurn.pendingProfileCalls = Math.max(0, activeTurn.pendingProfileCalls - 1)
        const stagePermissionMode = stage === 'planning' || stage === 'review'
          ? 'readonly'
          : runtimeContext.permissionMode
        const stageAgentPreset = stage === 'planning' || stage === 'review'
          ? 'tw-taskweaver-readonly'
          : 'tw-default'
        const sessionKey = roleSessionKey(profile, conversationId, stageAgentPreset)
        const streamToRenderer = discussionStrategy === 'relay' || summary
        activeTurn.activeSessions.set(profile.id, {
          profile, sessionKey, modelKey: profile.modelKey, permissionMode: stagePermissionMode, phase: 'preparing',
        })
        emitRoleProgress(activeTurn.webContents, conversationId, {
          roleId: profile.id,
          roleName: summary
            ? `${profile.name}（汇总）`
            : stageLabel ? `${profile.name}（${stageLabel}）` : profile.name,
          status: 'started',
          streamToRenderer,
        })
        let modelKey = profile.modelKey
        try {
          modelKey = (await resolveModelKeyForChat({ requestedKey: profile.modelKey, profileStore })).modelKey
          activeTurn.activeSessions.set(profile.id, {
            profile, sessionKey, modelKey, permissionMode: stagePermissionMode, phase: 'preparing',
          })
          if (controller.signal.aborted) {
            throw controller.signal.reason instanceof Error
              ? controller.signal.reason
              : new Error('角色对话已停止')
          }
          const buildPrompt = () => {
            const correctedUserText = addRoleCorrections(text ?? '', activeTurn.steeringMessages)
            if (summary) {
              return buildSummaryPrompt(correctedUserText, priorReplies, sharedContext)
            }
            const basePrompt = buildRolePrompt(correctedUserText, priorReplies, sharedContext, discussionStrategy)
            if (stage) {
              const stageContext = buildStagePromptContext({
                stage,
                duty: profile.duty,
                profile,
                originalGoal: correctedUserText,
                priorStageOutputs,
                repairFeedback,
                evidence,
              })
              return `${stageContext}\n\n${basePrompt}`
            }
            return basePrompt
          }
          const initialPrompt = buildPrompt()
          const result = await permissions.withExecution(
            stagePermissionMode,
            webContents,
            () => chat.runAgentTurn({
              conversationId,
              sessionKey,
              sessionMuxVisible: false,
              text: initialPrompt,
              // DSH invokes this synchronously after it claims the session's
              // turn slot. Corrections received during model/session setup are
              // included here; later corrections wait for the active turn and
              // are delivered through the normal steer path.
              textProvider: () => {
                const current = activeTurn.activeSessions.get(profile.id)
                if (current?.sessionKey === sessionKey) current.phase = 'submitted'
                return buildPrompt()
              },
              rolePersona: buildRolePersona(profile),
              roleToolCallLimit: MAX_ROLE_TOOL_CALLS,
              modelKey,
              webContents,
              cwd: runtimeContext.workspacePath,
              agentPreset: stageAgentPreset,
              permissionMode: stagePermissionMode,
              signal: controller.signal,
              attachments,
              documents,
              streamToRenderer,
            }),
            { conversationId, workspacePath: runtimeContext.workspacePath },
          )
          const durableResult = {
            ...result,
            turnId: result?.turnId ?? randomUUID(),
            text: result?.text?.trim() ? result.text : '（角色没有返回文本）',
          }
          const assistant = await persistNativeTurn({
            conversationId,
            modelKey,
            result: durableResult,
            speakerId: profile.id,
            speakerName: profile.name,
            roleMode: true,
            roleSummary: summary,
          })
          if (assistant) assistants.push(assistant)
          if (result?.text?.trim() && !summary) successfulReplies.set(profile.id, { name: profile.name, text: result.text })
          emitRoleProgress(webContents, conversationId, {
            roleId: profile.id,
            roleName: summary ? `${profile.name}（汇总）` : stageLabel ? `${profile.name}（${stageLabel}）` : profile.name,
            status: 'completed',
            streamToRenderer,
            ...(assistant ? { assistantMessage: assistant } : {}),
          })
          const replyText = result?.text?.trim() ?? ''
          return {
            ok: true,
            text: replyText,
            result: durableResult,
            ...(stage === 'review' ? { review: parseReviewResult(replyText) } : {}),
          }
        } catch (error) {
          const errorText = error instanceof Error ? error.message : String(error)
          const checkpointNote = stage === 'implementation' && activeTurn.rollbackCheckpoint?.id
            ? ` 预实施检查点 ${activeTurn.rollbackCheckpoint.id} 已保留，可在 Git 检查点面板查看或恢复。`
            : ''
          const message = `${errorText}${checkpointNote}`.slice(0, MAX_ROLE_ERROR_CHARS)
          const partial = error?.partialResult
          let partialAssistant = null
          if (partial && (partial.turnId || partial.text || partial.thinking)) {
            partialAssistant = await persistNativeTurn({
              conversationId,
              modelKey: error.modelKey ?? modelKey,
              result: { ...partial, turnId: partial.turnId ?? randomUUID() },
              errorMessage: message,
              errorCode: error.code ?? null,
              speakerId: profile.id,
              speakerName: profile.name,
              roleMode: true,
              roleSummary: summary,
            }).catch((persistenceError) => {
              console.error('[role-chat] 保存角色部分输出失败:', persistenceError instanceof Error ? persistenceError.message : persistenceError)
              return null
            })
            if (partialAssistant) assistants.push(partialAssistant)
          }
          roleErrors.push({ roleId: profile.id, roleName: summary ? '本轮汇总' : profile.name, message })
          emitRoleProgress(webContents, conversationId, {
            roleId: profile.id,
            roleName: summary ? `${profile.name}（汇总）` : stageLabel ? `${profile.name}（${stageLabel}）` : profile.name,
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            message,
            streamToRenderer,
            ...(partialAssistant ? { assistantMessage: partialAssistant } : {}),
          })
          return { ok: false, text: partial?.text?.trim() ?? '' }
        } finally {
          if (activeTurn.activeSessions.get(profile.id)?.sessionKey === sessionKey) {
            activeTurn.activeSessions.delete(profile.id)
          }
        }
      }

      const plan = resolveCollaborationPlan({ profiles, text: text ?? '', discussionStrategy })
      rolePipelineApplied = plan.isPipeline
      for (const missing of plan.missingAssignees ?? []) {
        const stageLabel = missing.stage === 'review'
          ? '质量审查'
          : missing.stage === 'implementation' ? '代码实施' : '方案规划'
        roleErrors.push({
          roleId: `missing-${missing.stage}`,
          roleName: stageLabel,
          message: `你指定的 Bot“${missing.name}”不在本轮可用角色中，系统没有改派给其他 Bot。`,
        })
      }

      if (discussionStrategy === 'independent') {
        await Promise.all(profiles.map((profile) => runProfile(profile)))
      } else if (plan.isPipeline) {
        // 依据 Bot 职责自动协作流水线：规划 -> 实施与证据采集 -> 审查；最多自动整改一次。
        const priorStageOutputs = []
        const implementationStage = plan.stages.find((item) => item.stage === 'implementation') ?? null
        let implementationEvidence = null
        const appendStageAudit = (stage, profile, reply, attempt = 1) => {
          pipelineAudit.stages.push({
            stage,
            stageLabel: attempt > 1 ? `${stage === 'review' ? '整改后复审' : '限次整改'}` : undefined,
            roleId: profile.id,
            roleName: profile.name,
            attempt,
            status: reply?.ok ? 'completed' : controller.signal.aborted ? 'cancelled' : 'failed',
            turnId: reply?.result?.turnId ?? null,
          })
        }
        const addUnresolvedReviewNotice = (review, reviewer, reason = '') => {
          const checkpoint = activeTurn.rollbackCheckpoint?.id
            ? `预实施检查点 ${activeTurn.rollbackCheckpoint.id} 已保留，可在 Git 检查点面板查看或恢复。`
            : ''
          const detail = review?.feedback ? `审查意见：${review.feedback.slice(0, 420)}` : ''
          roleErrors.push({
            roleId: `review-${review?.status ?? 'unknown'}`,
            roleName: `${reviewer?.profile?.name ?? reviewer?.name ?? '质量审查'}（未决风险）`,
            message: [reason, detail, checkpoint].filter(Boolean).join(' ').slice(0, MAX_ROLE_ERROR_CHARS),
          })
        }

        for (const { stage, stageLabel, profile } of plan.stages) {
          if (controller.signal.aborted) break
          if (stage === 'implementation' && !checkpointAttempted) {
            const checkpoint = await ensureImplementationCheckpoint()
            if (checkpoint?.blocking) {
              roleErrors.push({
                roleId: 'implementation-checkpoint',
                roleName: '工作区保护',
                message: `无法建立实施前 Git 检查点，已阻止代码实施以保护现有工作区：${checkpoint.reason}`,
              })
              break
            }
          }
          const reply = await runProfile(profile, {
            stage,
            stageLabel,
            priorStageOutputs,
          })

          appendStageAudit(stage, profile, reply)
          if (!reply.ok || !reply.text) break

          if (stage === 'planning') {
            priorStageOutputs.push({ stage, stageLabel, roleName: profile.name, text: reply.text })
            continue
          }

          if (stage === 'implementation') {
            implementationEvidence = await collectImplementationEvidence({
              result: reply.result,
              checkpoint: activeTurn.rollbackCheckpoint,
              conversationId,
              workspacePath: runtimeContext.workspacePath,
              getGitCheckpointDiff,
              userDataPath,
              chat,
            })
            pipelineAudit.evidence = {
              diffSource: implementationEvidence.diffSource,
              changedFiles: implementationEvidence.changedFiles,
              testRuns: implementationEvidence.testRuns,
            }
            priorStageOutputs.push({
              stage,
              stageLabel,
              roleName: profile.name,
              evidence: implementationEvidence,
            })
            continue
          }

          if (stage !== 'review') {
            priorStageOutputs.push({ stage, stageLabel, roleName: profile.name, text: reply.text })
            continue
          }

          const review = reply.review ?? { status: 'unknown', feedback: reply.text }
          pipelineAudit.reviewStatus = review.status
          if (review.status === 'approved') break
          if (review.status === 'unknown') {
            addUnresolvedReviewNotice(
              review,
              { profile },
              '审查 Bot 未输出唯一、有效的 [REVIEW_RESULT: APPROVED/REJECTED] 标记；系统未将其视为通过，也未根据模糊结论自动修改。',
            )
            break
          }

          const reviewFeedback = reply.text
          priorStageOutputs.push({ stage: 'review', stageLabel, roleName: profile.name, text: reviewFeedback })
          if (!implementationStage || pipelineAudit.repairAttempts >= 1) {
            addUnresolvedReviewNotice(review, { profile }, '审查结论为需整改，但本轮没有可用的独立实施 Bot，未自动改派其他角色。')
            break
          }

          pipelineAudit.repairAttempts = 1
          activeTurn.pendingProfileCalls += 1
          const repair = await runProfile(implementationStage.profile, {
            stage: 'implementation',
            stageLabel: '限次整改 1/1',
            priorStageOutputs,
            repairFeedback: reviewFeedback,
            evidence: implementationEvidence,
          })
          appendStageAudit('implementation', implementationStage.profile, repair, 2)
          if (!repair.ok || !repair.text) {
            pipelineAudit.reviewStatus = 'repair_failed'
            addUnresolvedReviewNotice(review, { profile }, 'Reviewer 已驳回，但唯一整改轮未成功完成；需要人工复核。')
            break
          }

          implementationEvidence = await collectImplementationEvidence({
            result: repair.result,
            checkpoint: activeTurn.rollbackCheckpoint,
            conversationId,
            workspacePath: runtimeContext.workspacePath,
            getGitCheckpointDiff,
            userDataPath,
            chat,
          })
          pipelineAudit.evidence = {
            diffSource: implementationEvidence.diffSource,
            changedFiles: implementationEvidence.changedFiles,
            testRuns: implementationEvidence.testRuns,
          }
          priorStageOutputs.push({
            stage: 'implementation',
            stageLabel: '限次整改 1/1',
            roleName: implementationStage.profile.name,
            evidence: implementationEvidence,
          })

          activeTurn.pendingProfileCalls += 1
          const finalReview = await runProfile(profile, {
            stage: 'review',
            stageLabel: '整改后复审',
            priorStageOutputs,
            evidence: implementationEvidence,
          })
          appendStageAudit('review', profile, finalReview, 2)
          const finalDecision = finalReview.review ?? { status: 'unknown', feedback: finalReview.text }
          pipelineAudit.reviewStatus = finalReview.ok ? finalDecision.status : 'review_failed'
          if (!finalReview.ok || finalDecision.status !== 'approved') {
            const reason = finalDecision.status === 'rejected'
              ? '唯一整改轮后 Reviewer 仍判定需整改；未决风险需人工复核。'
              : '整改后的审查未能确认通过；系统按未通过处理并要求人工复核。'
            addUnresolvedReviewNotice(finalDecision, { profile }, reason)
          }
          break
        }
      } else {
        const priorReplies = []
        for (const profile of profiles) {
          if (controller.signal.aborted) break
          const reply = await runProfile(profile, { priorReplies })
          if (reply.ok && reply.text) priorReplies.push({ name: profile.name, text: reply.text })
        }
      }

      if (summarize && !controller.signal.aborted && successfulReplies.size > 0) {
        const lead = profiles[0]
        const orderedReplies = profiles.map((profile) => successfulReplies.get(profile.id)).filter(Boolean)
        await runProfile(lead, { priorReplies: orderedReplies, summary: true })
      }
    } finally {
      if (activeTurns.get(conversationId) === activeTurn) activeTurns.delete(conversationId)
    }

    return {
      user: userEntry,
      assistants,
      roleErrors,
      ...(rolePipelineApplied ? { rolePipeline: pipelineAudit } : {}),
    }
  }

  return {
    send,
    isRunning: (conversationId) => activeTurns.has(conversationId),
    async steer({ conversationId, text, webContents }) {
      const normalizedText = typeof text === 'string' ? text.trim() : ''
      if (!normalizedText) throw new Error('纠偏内容不能为空')
      const activeTurn = activeTurns.get(conversationId)
      if (!activeTurn || activeTurn.controller.signal.aborted) {
        throw new Error('当前没有正在运行的 Bot 任务，纠偏未发送。')
      }

      const activeSessions = [...activeTurn.activeSessions.values()]
      if (activeSessions.length === 0 && activeTurn.pendingProfileCalls === 0) {
        throw new Error('Bot 本轮已完成，纠偏未发送。')
      }

      const correction = { id: randomUUID(), text: normalizedText }
      activeTurn.steeringMessages.push(correction)
      const busySessions = activeSessions.filter(({ sessionKey }) => chat.isBusy?.(sessionKey))
      const busySessionKeys = new Set(busySessions.map(({ sessionKey }) => sessionKey))
      const preparingSessions = activeSessions.filter(({ sessionKey, phase }) => (
        phase === 'preparing' && !busySessionKeys.has(sessionKey)
      ))
      const targetWebContents = webContents ?? activeTurn.webContents
      const deliveries = await Promise.allSettled(busySessions.map(({ profile, sessionKey, modelKey, permissionMode }) => (
        permissions.withExecution(
          permissionMode ?? activeTurn.runtimeContext.permissionMode,
          targetWebContents,
          () => chat.send({
            text: normalizedText,
            modelKey,
            conversationId,
            sessionKey,
            eventConversationId: conversationId,
            webContents: targetWebContents,
            cwdOverride: activeTurn.runtimeContext.workspacePath,
            agentPreset: 'tw-default',
            permissionMode: permissionMode ?? activeTurn.runtimeContext.permissionMode,
            rolePersona: buildRolePersona(profile),
            roleToolCallLimit: MAX_ROLE_TOOL_CALLS,
            sessionMuxVisible: false,
            behavior: 'steer',
            activeOnly: true,
          }),
          { conversationId, workspacePath: activeTurn.runtimeContext.workspacePath },
        )
      )))
      const accepted = deliveries.filter((result) => result.status === 'fulfilled').length
      const futureRecipients = activeTurn.pendingProfileCalls > 0 || preparingSessions.length > 0
      if (accepted === 0 && !futureRecipients) {
        activeTurn.steeringMessages = activeTurn.steeringMessages.filter((item) => item.id !== correction.id)
        const failure = deliveries.find((result) => result.status === 'rejected')
        throw failure?.reason instanceof Error
          ? failure.reason
          : new Error('当前 Bot 已结束本轮，纠偏未发送。')
      }

      await appendUserChatEntry(normalizedText, conversationId, {
        appState,
        behavior: 'steer',
        roleMode: true,
      })
      const missed = busySessions.length - accepted
      return {
        accepted: true,
        targets: accepted,
        includedInUpcomingRoles: futureRecipients,
        ...(missed > 0 ? { warning: '部分正在运行的 Bot 未接收到纠偏；后续尚未开始的 Bot 会收到。' } : {}),
      }
    },
    abort(conversationId) {
      const activeTurn = activeTurns.get(conversationId)
      if (!activeTurn) return false
      activeTurn.controller.abort(new Error('角色对话已停止'))
      const activeSessions = [...activeTurn.activeSessions.values()]
      if (!activeTurn.cancelPromise && activeSessions.length && typeof chat.abort === 'function') {
        activeTurn.cancelPromise = Promise.allSettled(activeSessions.map(({ sessionKey }) => (
          Promise.resolve().then(() => chat.abort(sessionKey))
        )))
        // The IPC caller can await the same promise; this handler prevents an
        // unhandled rejection if the renderer disappears during cancellation.
        activeTurn.cancelPromise.catch(() => {})
      }
      for (const { profile } of activeSessions) {
        emitRoleProgress(activeTurn.webContents, conversationId, {
          roleId: profile.id,
          roleName: profile.name,
          status: 'cancelled',
          streamToRenderer: false,
        })
      }
      return true
    },
    async waitForAbort(conversationId) {
      const activeTurn = activeTurns.get(conversationId)
      if (activeTurn?.cancelPromise) await activeTurn.cancelPromise
    },
    listRunningConversationIds: () => [...activeTurns.keys()],
  }
}
