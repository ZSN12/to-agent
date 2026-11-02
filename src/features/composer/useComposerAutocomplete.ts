import { useEffect, useMemo, useState, type RefObject } from 'react'
import type { RoleProfile, SkillOption, WorkspaceEntry, WorkspaceReference } from '../../shared/app-api'
import { findRoleMentionQuery, insertRoleMention } from '../roles/role-routing'
import { BUILTIN_SLASH_COMMANDS, findContextQuery, findSkillQuery, type SlashCommandItem } from './slashCommands'

export interface UseComposerAutocompleteOptions {
  value: string
  setValue: (next: string | ((prev: string) => string)) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  skills: SkillOption[]
  selectedRoleProfiles: RoleProfile[]
  roleMode?: boolean
  onSearchContext: (query: string) => Promise<WorkspaceEntry[]>
  onMultiAgentOrchestrationChange?: (enabled: boolean) => void
  setWorkMode?: (mode: 'code' | 'plan' | 'goal') => void
  onWorkModeChange?: (mode: 'code' | 'plan' | 'goal') => void
  setSelectedSkill?: (skill: string | null) => void
  onSelectedSkillChange?: (skill: string | null) => void
}

export function useComposerAutocomplete({
  value,
  setValue,
  textareaRef,
  skills,
  selectedRoleProfiles,
  roleMode = false,
  onSearchContext,
  onMultiAgentOrchestrationChange,
  setWorkMode: setWorkModeProp,
  onWorkModeChange,
  setSelectedSkill: setSelectedSkillProp,
  onSelectedSkillChange,
}: UseComposerAutocompleteOptions) {
  const setWorkMode = onWorkModeChange ?? setWorkModeProp ?? (() => {})
  const setSelectedSkill = onSelectedSkillChange ?? setSelectedSkillProp ?? (() => {})
  const [skillQuery, setSkillQuery] = useState<{ start: number; query: string } | null>(null)
  const [contextQuery, setContextQuery] = useState<{ start: number; query: string } | null>(null)
  const [roleMentionQuery, setRoleMentionQuery] = useState<{ start: number; query: string } | null>(null)
  const [contextEntries, setContextEntries] = useState<WorkspaceEntry[]>([])
  const [activeSkillIndex, setActiveSkillIndex] = useState(0)
  const [activeContextIndex, setActiveContextIndex] = useState(0)
  const [activeRoleMentionIndex, setActiveRoleMentionIndex] = useState(0)

  const matchingCommands = useMemo(() => {
    const query = skillQuery?.query.toLowerCase() ?? ''
    if (!query) return BUILTIN_SLASH_COMMANDS
    return BUILTIN_SLASH_COMMANDS.filter((cmd) =>
      cmd.command.toLowerCase().includes(query) ||
      cmd.title.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query)
    )
  }, [skillQuery?.query])

  const matchingSkills = useMemo(() => {
    const query = skillQuery?.query.toLocaleLowerCase() ?? ''
    return skills.filter((skill) =>
      !query ||
      skill.name.toLocaleLowerCase().includes(query) ||
      skill.description.toLocaleLowerCase().includes(query)
    )
  }, [skills, skillQuery?.query])

  const matchingRoleProfiles = useMemo(() => {
    const query = roleMentionQuery?.query.toLocaleLowerCase() ?? ''
    return selectedRoleProfiles.filter((profile) =>
      !query || profile.name.toLocaleLowerCase().includes(query)
    )
  }, [roleMentionQuery?.query, selectedRoleProfiles])

  const totalSlashCount = matchingCommands.length + matchingSkills.length

  useEffect(() => {
    if (!contextQuery) {
      setContextEntries([])
      return
    }
    let cancelled = false
    const timer = window.setTimeout(() => {
      void onSearchContext(contextQuery.query).then((entries) => {
        if (!cancelled) setContextEntries(entries)
      })
    }, 80)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [contextQuery?.query, onSearchContext])

  const updateCommandQuery = (text: string, cursor: number, forceContext = false) => {
    const nextSkill = findSkillQuery(text, cursor)
    const nextRoleMention = roleMode && !forceContext && !nextSkill && selectedRoleProfiles.length
      ? findRoleMentionQuery(text, cursor)
      : null
    if (nextRoleMention) {
      setSkillQuery(null)
      setContextQuery(null)
      setRoleMentionQuery(nextRoleMention)
      setActiveRoleMentionIndex(0)
      return
    }
    setRoleMentionQuery(null)
    const nextContext = nextSkill ? null : findContextQuery(text, cursor)
    setSkillQuery(nextSkill)
    setContextQuery(nextContext)
    setActiveSkillIndex(0)
    setActiveContextIndex(0)
  }

  const chooseCommand = (cmd: SlashCommandItem) => {
    if (!skillQuery) return
    if (cmd.id === 'multi-on') {
      onMultiAgentOrchestrationChange?.(true)
      setSkillQuery(null)
      setValue('')
      return
    }
    if (cmd.id === 'multi-off') {
      onMultiAgentOrchestrationChange?.(false)
      setSkillQuery(null)
      setValue('')
      return
    }
    if (cmd.id === 'compact' || cmd.id === 'plan') {
      const commandText = `/${cmd.command}`
      setValue(commandText)
      setSkillQuery(null)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(commandText.length, commandText.length)
      })
      return
    }
    const nextValue = `${value.slice(0, skillQuery.start)}${value.slice(skillQuery.start + skillQuery.query.length + 1)}`
    const cursor = skillQuery.start
    setValue(nextValue.trimStart())
    if (cmd.mode) {
      setWorkMode(cmd.mode)
    }
    setSkillQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const chooseSkill = (skill: SkillOption) => {
    if (!skillQuery) return
    const nextValue = `${value.slice(0, skillQuery.start)}${value.slice(skillQuery.start + skillQuery.query.length + 1)}`
    const cursor = skillQuery.start
    setValue(nextValue)
    setSelectedSkill(skill.name)
    setSkillQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const insertReference = (reference: WorkspaceEntry | WorkspaceReference) => {
    const token = 'token' in reference
      ? reference.token
      : `@${reference.kind === 'directory' ? 'dir' : 'file'}:${reference.path.includes(' ') ? `"${reference.path.replaceAll('"', '\\"')}"` : reference.path}`
    const start = contextQuery?.start ?? textareaRef.current?.selectionStart ?? value.length
    const end = contextQuery ? contextQuery.start + contextQuery.query.length + 1 : start
    const spacer = value.slice(end).startsWith(' ') || end === value.length ? '' : ' '
    const nextValue = `${value.slice(0, start)}${token}${spacer}${value.slice(end)}`
    const cursor = start + token.length + spacer.length
    setValue(nextValue)
    setContextQuery(null)
    setRoleMentionQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
    })
  }

  const chooseRoleMention = (profile: RoleProfile) => {
    if (!roleMentionQuery) return
    const inserted = insertRoleMention(value, roleMentionQuery, profile.name)
    setValue(inserted.text)
    setRoleMentionQuery(null)
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor)
    })
  }

  const openContextMenu = () => {
    const textarea = textareaRef.current
    const cursor = textarea?.selectionStart ?? value.length
    const prefix = cursor > 0 && !/\s/.test(value[cursor - 1]) ? ' @' : '@'
    const nextValue = `${value.slice(0, cursor)}${prefix}${value.slice(cursor)}`
    const nextCursor = cursor + prefix.length
    setValue(nextValue)
    updateCommandQuery(nextValue, nextCursor, true)
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  const clearQueries = () => {
    setSkillQuery(null)
    setContextQuery(null)
    setRoleMentionQuery(null)
  }

  const handleAutocompleteKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (event.nativeEvent.isComposing) return false

    // Role Mention 弹层处理
    if (roleMentionQuery && matchingRoleProfiles.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveRoleMentionIndex((idx) => (idx + 1) % matchingRoleProfiles.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveRoleMentionIndex((idx) => (idx - 1 + matchingRoleProfiles.length) % matchingRoleProfiles.length)
        return true
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setRoleMentionQuery(null)
        return true
      }
      const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
      if (plainEnter) {
        event.preventDefault()
        chooseRoleMention(matchingRoleProfiles[activeRoleMentionIndex] ?? matchingRoleProfiles[0])
        return true
      }
    }

    // Context 弹层处理
    if (contextQuery && contextEntries.length) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveContextIndex((idx) => {
          const next = (idx + 1) % contextEntries.length
          requestAnimationFrame(() => {
            const elem = document.getElementById(`context-command-${next}`)
            if (elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
          return next
        })
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveContextIndex((idx) => {
          const next = (idx - 1 + contextEntries.length) % contextEntries.length
          requestAnimationFrame(() => {
            const elem = document.getElementById(`context-command-${next}`)
            if (elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
          return next
        })
        return true
      }
      const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
      if (plainEnter) {
        event.preventDefault()
        insertReference(contextEntries[activeContextIndex] ?? contextEntries[0])
        return true
      }
    }

    // Skill / Slash Command 弹层处理
    if (skillQuery && totalSlashCount) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setActiveSkillIndex((idx) => {
          const next = (idx + 1) % totalSlashCount
          requestAnimationFrame(() => {
            const menu = document.getElementById('skill-command-options')
            const elem = document.getElementById(next < matchingCommands.length ? `slash-cmd-${next}` : `slash-skill-${next}`)
            if (menu && elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
          return next
        })
        return true
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setActiveSkillIndex((idx) => {
          const next = (idx - 1 + totalSlashCount) % totalSlashCount
          requestAnimationFrame(() => {
            const menu = document.getElementById('skill-command-options')
            const elem = document.getElementById(next < matchingCommands.length ? `slash-cmd-${next}` : `slash-skill-${next}`)
            if (menu && elem) elem.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
          return next
        })
        return true
      }
      const plainEnter = event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey
      if (plainEnter) {
        event.preventDefault()
        if (activeSkillIndex < matchingCommands.length) {
          chooseCommand(matchingCommands[activeSkillIndex])
        } else {
          chooseSkill(matchingSkills[activeSkillIndex - matchingCommands.length])
        }
        return true
      }
    }

    return false
  }

  const isCommandOpen = Boolean(
    (skillQuery && totalSlashCount > 0) ||
    (roleMentionQuery && matchingRoleProfiles.length > 0) ||
    (contextQuery && contextEntries.length > 0)
  )

  const activeOptionId = skillQuery
    ? (activeSkillIndex < matchingCommands.length ? `slash-cmd-${activeSkillIndex}` : `slash-skill-${activeSkillIndex}`)
    : roleMentionQuery
      ? `role-mention-${activeRoleMentionIndex}`
      : contextQuery
        ? `context-command-${activeContextIndex}`
        : undefined

  return {
    skillQuery,
    setSkillQuery,
    contextQuery,
    setContextQuery,
    roleMentionQuery,
    setRoleMentionQuery,
    contextEntries,
    activeSkillIndex,
    activeContextIndex,
    activeRoleMentionIndex,
    matchingCommands,
    matchingSkills,
    matchingRoleProfiles,
    totalSlashCount,
    isCommandOpen,
    activeOptionId,
    updateCommandQuery,
    chooseCommand,
    chooseSkill,
    insertReference,
    chooseRoleMention,
    openContextMenu,
    clearQueries,
    handleAutocompleteKeyDown,
    handleKeyDownForAutocomplete: handleAutocompleteKeyDown,
  }
}
