import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  /** The dialog's own class (its size and layout in styles.css). */
  className: string
  /** Beside the title: what is being edited, or actions on it. */
  header?: ReactNode
  footer: ReactNode
  /** Esc, and a click outside when `closeOnBackdrop`. */
  onClose: () => void
  /** Only for dialogs with nothing to lose (a click outside would throw edits away). */
  closeOnBackdrop?: boolean
  children: ReactNode
}

/** A modal dialog: title bar, body and buttons, closed with Esc. Takes the focus while it is open. */
export function Dialog({ title, className, header, footer, onClose, closeOnBackdrop = false, children }: Props) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // Into the dialog unless a field in it already has the focus (autoFocus)
    if (!box.current?.contains(document.activeElement)) box.current?.focus()
  }, [])
  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal
      aria-label={title}
      onClick={closeOnBackdrop ? onClose : undefined}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        onClose()
      }}
    >
      <div ref={box} className={`modal ${className}`} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          {header}
        </header>
        {children}
        <footer>{footer}</footer>
      </div>
    </div>
  )
}
