import { useCallback, useRef, useState } from 'react'
import type { SkillOption } from '../../../shared/app-api'
import { readCachedSkillCatalog, writeSkillCatalogCache } from '../../skills/useEnabledSkills'
import { getBridge } from '../getBridge'

export function useSkills(workspacePathRef: { current: string | null }) {
  const [skills, setSkills] = useState<SkillOption[]>([])
  const [skillsLoading, setSkillsLoading] = useState(true)
  const skillsRequestsRef = useRef(new Map<string, Promise<void>>())

  const refreshSkills = useCallback(async (workspacePathOverride?: string | null) => {
    const bridge = getBridge()
    if (!bridge?.skills?.list) {
      setSkillsLoading(false)
      return
    }
    const workspacePath = workspacePathOverride === undefined ? workspacePathRef.current : workspacePathOverride
    const requestKey = workspacePath ?? '<no-workspace>'
    workspacePathRef.current = workspacePath
    const cachedCatalog = readCachedSkillCatalog(workspacePath)
    setSkills(cachedCatalog ?? [])
    const pending = skillsRequestsRef.current.get(requestKey)
    if (pending) {
      await pending
      return
    }
    setSkillsLoading(true)
    const request = (async () => {
      try {
        const result = await bridge.skills?.list()
        if (result?.ok) {
          const catalog = result.data ?? []
          writeSkillCatalogCache(catalog, workspacePath)
          if (workspacePathRef.current === workspacePath) setSkills(catalog)
        }
      } catch (err) {
        console.warn('[useSkills] Skill 目录加载失败:', err)
      } finally {
        if (workspacePathRef.current === workspacePath) setSkillsLoading(false)
      }
    })()
    skillsRequestsRef.current.set(requestKey, request)
    try {
      await request
    } finally {
      if (skillsRequestsRef.current.get(requestKey) === request) skillsRequestsRef.current.delete(requestKey)
    }
  }, [workspacePathRef])

  return { skills, skillsLoading, refreshSkills }
}
