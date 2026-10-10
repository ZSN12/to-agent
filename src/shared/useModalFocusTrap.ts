import { useEffect, useRef } from 'react'

type ModalFocusTrapOptions = {
  open: boolean
  onEscape?: () => void
  getInitialFocus?: () => HTMLElement | null
}

/** Keep keyboard focus inside an open modal and return it to the opener on close. */
export function useModalFocusTrap<T extends HTMLElement>({
  open,
  onEscape,
  getInitialFocus,
}: ModalFocusTrapOptions) {
  const dialogRef = useRef<T>(null)
  const onEscapeRef = useRef(onEscape)
  const getInitialFocusRef = useRef(getInitialFocus)
  onEscapeRef.current = onEscape
  getInitialFocusRef.current = getInitialFocus

  useEffect(() => {
    if (!open) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    if (!dialog) return

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter((element) => !element.closest('[hidden], [aria-hidden="true"]') && element.getClientRects().length > 0)

    const initialFocus = getInitialFocusRef.current?.()
    const firstFocusable = getFocusable()[0]
    const target = initialFocus && dialog.contains(initialFocus) && !initialFocus.hasAttribute('disabled')
      ? initialFocus
      : firstFocusable ?? dialog
    target.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscapeRef.current) {
        event.preventDefault()
        onEscapeRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open])

  return dialogRef
}
