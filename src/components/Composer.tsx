import { ArrowUp, Feather, MessageCircle, MoreHorizontal, Square, WandSparkles } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'
import type { ActionType, OperationProgress, WorldLabels } from '../../shared/types'
import { OperationProgressPanel } from './OperationProgressPanel'

const createModes = (labels: WorldLabels): Array<{ value: ActionType; label: string; icon: typeof Feather; placeholder: string }> => [
  { value: 'do', label: labels.action, icon: Feather, placeholder: `Опишите: ${labels.action.toLocaleLowerCase('ru-RU')}…` },
  { value: 'say', label: labels.speech, icon: MessageCircle, placeholder: `Введите: ${labels.speech.toLocaleLowerCase('ru-RU')}…` },
  { value: 'story', label: labels.direction, icon: WandSparkles, placeholder: `Направьте сцену: ${labels.direction.toLocaleLowerCase('ru-RU')}…` },
  { value: 'continue', label: labels.continue, icon: MoreHorizontal, placeholder: 'Оставьте пустым или добавьте пожелание…' },
]

interface ComposerProps {
  value: string
  mode: ActionType
  generating: boolean
  progress?: OperationProgress
  labels: WorldLabels
  onValue: (value: string) => void
  onMode: (mode: ActionType) => void
  onSend: () => void
  onCancel: () => void
}

export function Composer({ value, mode, generating, progress, labels, onValue, onMode, onSend, onCancel }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modes = createModes(labels)
  const selected = modes.find((item) => item.value === mode)!

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = '0px'
    textarea.style.height = `${Math.min(156, Math.max(52, textarea.scrollHeight))}px`
  }, [value])

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      onSend()
    }
  }

  return (
    <div className="composer-wrap">
      <div className="composer">
        <div className="composer-modes" role="tablist" aria-label="Тип хода">
          {modes.map((item) => {
            const Icon = item.icon
            return <button key={item.value} role="tab" aria-selected={mode === item.value} className={mode === item.value ? 'is-active' : ''} onClick={() => onMode(item.value)}><Icon size={14} /> {item.label}</button>
          })}
        </div>
        <div className="composer-input-row">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={selected.placeholder}
            aria-label={selected.placeholder}
            disabled={generating}
            rows={1}
          />
          {generating ? (
            <button className="send-button is-stop" onClick={onCancel} aria-label="Остановить генерацию"><Square size={16} fill="currentColor" /></button>
          ) : (
            <button className="send-button" onClick={onSend} disabled={mode !== 'continue' && !value.trim()} aria-label="Отправить ход"><ArrowUp size={19} /></button>
          )}
        </div>
        {generating ? <OperationProgressPanel progress={progress} compact /> : <div className="composer-hint">Ctrl + Enter — отправить · ИИ не принимает решения за вашего героя</div>}
      </div>
    </div>
  )
}
