import { useEffect } from 'react'
import { matchesKeys, type ShortcutItem } from '../../shared/shortcuts'

type Params = {
  shortcuts: ShortcutItem[]
  settingsOpen: boolean
  terminalOpen: boolean
  panelOpen: boolean
  sending: boolean
  onToggleTerminal: () => void
  onCloseTerminal: () => void
  onCloseSettings: () => void
  onClosePanel: () => void
  onNewChat: () => void
  onToggleDagPanel: () => void
  onCancelMessage: () => void
}

export function useAppKeyboardShortcuts({
  shortcuts,
  settingsOpen,
  terminalOpen,
  panelOpen,
  sending,
  onToggleTerminal,
  onCloseTerminal,
  onCloseSettings,
  onClosePanel,
  onNewChat,
  onToggleDagPanel,
  onCancelMessage,
}: Params) {
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return
      if ((event.ctrlKey || (event.metaKey && event.altKey)) && (event.key === '`' || event.key === '~')) {
        event.preventDefault()
        onToggleTerminal()
        return
      }

      const shortcutKeys = (id: string, fallback: string[]) => shortcuts.find((item) => item.id === id)?.keys ?? fallback
      if (matchesKeys(event, shortcutKeys('new-chat', ['⌘', 'N']))) {
        event.preventDefault()
        onNewChat()
        return
      }
      if (matchesKeys(event, shortcutKeys('toggle-dag', ['⌘', 'B']))) {
        event.preventDefault()
        onToggleDagPanel()
        return
      }
      if (!matchesKeys(event, shortcutKeys('cancel-esc', ['Esc']))) return

      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.closest('[role="listbox"], [role="menu"], select')) return
      if (settingsOpen) {
        event.preventDefault()
        onCloseSettings()
        return
      }
      if (terminalOpen) {
        event.preventDefault()
        onCloseTerminal()
        return
      }
      if (panelOpen) {
        event.preventDefault()
        onClosePanel()
        return
      }
      if (sending) {
        event.preventDefault()
        onCancelMessage()
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [
    shortcuts,
    settingsOpen,
    terminalOpen,
    panelOpen,
    sending,
    onToggleTerminal,
    onCloseTerminal,
    onCloseSettings,
    onClosePanel,
    onNewChat,
    onToggleDagPanel,
    onCancelMessage,
  ])
}
