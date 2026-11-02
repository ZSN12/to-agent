import { useCallback, useEffect, useRef, useState } from 'react'

export type MainViewType = 'chat' | 'plugins' | 'pull-requests' | 'schedules' | 'explore'

export function useMainViewNavigation(initialView: MainViewType = 'chat') {
  const [mainView, setMainView] = useState<MainViewType>(initialView)
  const mainViewHistoryRef = useRef<MainViewType[]>([initialView])
  const mainViewHistoryIndexRef = useRef(0)
  const skipMainViewHistoryChangeRef = useRef(false)
  const [mainViewNavigation, setMainViewNavigation] = useState({ canGoBack: false, canGoForward: false })
  const [visitedViews, setVisitedViews] = useState<Set<string>>(() => new Set([initialView]))

  useEffect(() => {
    const history = mainViewHistoryRef.current
    if (skipMainViewHistoryChangeRef.current) {
      skipMainViewHistoryChangeRef.current = false
    } else if (history[mainViewHistoryIndexRef.current] !== mainView) {
      history.splice(mainViewHistoryIndexRef.current + 1)
      history.push(mainView)
      mainViewHistoryIndexRef.current = history.length - 1
    }

    setMainViewNavigation({
      canGoBack: mainViewHistoryIndexRef.current > 0,
      canGoForward: mainViewHistoryIndexRef.current < history.length - 1,
    })
  }, [mainView])

  const navigateMainViewHistory = useCallback((direction: -1 | 1) => {
    const history = mainViewHistoryRef.current
    const nextIndex = mainViewHistoryIndexRef.current + direction
    if (nextIndex < 0 || nextIndex >= history.length) return

    mainViewHistoryIndexRef.current = nextIndex
    skipMainViewHistoryChangeRef.current = true
    setMainView(history[nextIndex])
    setMainViewNavigation({
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < history.length - 1,
    })
  }, [])

  useEffect(() => {
    setVisitedViews((prev) => {
      if (prev.has(mainView)) return prev
      const next = new Set(prev)
      next.add(mainView)
      return next
    })
  }, [mainView])

  return {
    mainView,
    setMainView,
    mainViewNavigation,
    navigateMainViewHistory,
    visitedViews,
  }
}
