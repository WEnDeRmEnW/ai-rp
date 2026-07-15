import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  width?: 'medium' | 'large'
}

export function Modal({ open, onClose, title, eyebrow, children, width = 'medium' }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current()
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    document.body.classList.add('modal-open')
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('input, textarea, button')?.focus())
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.classList.remove('modal-open')
      previous?.focus()
    }
  }, [open])

  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div ref={panelRef} className={`modal-panel modal-panel--${width}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
