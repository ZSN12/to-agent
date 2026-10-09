import { useCallback, type MutableRefObject } from 'react'
import { getBridge } from '../getBridge'

export function useTaskActions(activeConversationIdRef: MutableRefObject<string | null>, setError: (message: string | null) => void) {
  const sendTaskMessage = useCallback(async (taskId: string, text: string) => {
    const bridge = getBridge()
    if (!bridge?.tasks) {
      setError('子任务对话后端不可用')
      return false
    }
    const res = await bridge.tasks.sendMessage(taskId, text, activeConversationIdRef.current)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    return true
  }, [activeConversationIdRef, setError])

  const cancelTask = useCallback(async (taskId: string) => {
    const bridge = getBridge()
    if (!bridge?.tasks?.cancel) return false
    const res = await bridge.tasks.cancel(taskId, activeConversationIdRef.current)
    if (!res.ok) {
      setError(res.error)
      return false
    }
    if (!res.data.cancelled) setError('该子任务已结束或无法停止')
    return res.data.cancelled
  }, [activeConversationIdRef, setError])

  return { sendTaskMessage, cancelTask }
}
