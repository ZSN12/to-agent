import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SkillOption } from '../../shared/app-api'

const STORAGE_KEY = 'taskweaver:enabled-skills'
const CHANGE_EVENT = 'taskweaver:enabled-skills-changed'
export const SKILL_CATALOG_EVENT = 'taskweaver:skills-catalog-loaded'
const SKILL_CATALOG_CACHE_KEY = 'taskweaver:skill-catalog-cache'

export function readCachedSkillCatalog(workspacePath: string | null): SkillOption[] | null {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(SKILL_CATALOG_CACHE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || !('workspacePath' in parsed) || !('skills' in parsed)) return null
    if (parsed.workspacePath !== workspacePath || !Array.isArray(parsed.skills)) return null
    return parsed.skills.filter((item): item is SkillOption =>
      Boolean(item)
      && typeof item.name === 'string'
      && typeof item.description === 'string'
      && typeof item.path === 'string'
      && (item.source === 'app' || item.source === 'workspace' || item.source === 'dsh')
      && typeof item.multiAgent === 'boolean',
    )
  } catch {
    return null
  }
}

export function writeSkillCatalogCache(skills: SkillOption[], workspacePath: string | null) {
  try {
    window.localStorage.setItem(SKILL_CATALOG_CACHE_KEY, JSON.stringify({ workspacePath, skills }))
  } catch {
    // Skill discovery remains available from the live backend if storage is full or disabled.
  }
}

function readPreference(): string[] | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === null) return null
    const parsed: unknown = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed.filter((name): name is string => typeof name === 'string') : null
  } catch {
    return null
  }
}

export function useEnabledSkills(skillNames: string[]) {
  const [preference, setPreference] = useState<string[] | null>(() => readPreference())

  useEffect(() => {
    const sync = () => setPreference(readPreference())
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  const enabledNames = useMemo(
    () => new Set(preference ?? skillNames),
    [preference, skillNames],
  )

  const toggleSkill = useCallback((name: string) => {
    const current = new Set(readPreference() ?? skillNames)
    if (current.has(name)) current.delete(name)
    else current.add(name)
    const next = [...current]
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Keep the current window responsive even when storage is unavailable.
    }
    setPreference(next)
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }, [skillNames])

  return { enabledNames, toggleSkill }
}
