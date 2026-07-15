import { ArrowUp, Feather, MessageCircle, MoreHorizontal, Square, WandSparkles } from 'lucide-react'
import { memo, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import type { ActionType, OperationProgress, WorldLabels } from '../../shared/types'
import { OperationProgressPanel } from './OperationProgressPanel'

type ComposerLabels = Pick<WorldLabels, 'action' | 'speech' | 'direction' | 'continue'>

const createModes = (labels: ComposerLabels): Array<{ value: ActionType; label: string; icon: typeof Feather; placeholder: string; description: string }> => [
  { value: 'do', label: labels.action, icon: Feather, placeholder: `Опишите: ${labels.action.toLocaleLowerCase('ru-RU')}…`, description: 'Что делает ваш герой' },
  { value: 'say', label: labels.speech, icon: MessageCircle, placeholder: `Введите: ${labels.speech.toLocaleLowerCase('ru-RU')}…`, description: 'Точные слова героя' },
  { value: 'story', label: labels.direction, icon: WandSparkles, placeholder: `Направьте сцену: ${labels.direction.toLocaleLowerCase('ru-RU')}…`, description: 'Авторская правка или факт' },
  { value: 'continue', label: labels.continue, icon: MoreHorizontal, placeholder: 'Оставьте пустым или добавьте пожелание…', description: 'Пусть мир сделает следующий шаг' },
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

export const Composer = memo(function Composer({ value, mode, generating, progress, labels, onValue, onMode, onSend, onCancel }: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { action, speech, direction, continue: continueLabel } = labels
  const modes = useMemo(() => createModes({ action, speech, direction, continue: continueLabel }), [action, continueLabel, direction, speech])
  const selected = modes.find((item) => item.value === mode)!
  const SelectedIcon = selected.icon

  useLayoutEffect(() => {
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
            return <button key={item.value} role="tab" aria-selected={mode === item.value} className={mode === item.value ? 'is-active' : ''} title={item.description} onClick={() => onMode(item.value)}><Icon size={14} /> <span>{item.label}</span></button>
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
            aria-describedby="composer-description"
            disabled={generating}
            rows={1}
          />
          {generating ? (
            <button className="send-button is-stop" onClick={onCancel} aria-label="Остановить генерацию"><Square size={16} fill="currentColor" /></button>
          ) : (
            <button className="send-button" onClick={onSend} disabled={mode !== 'continue' && !value.trim()} aria-label="Отправить ход"><ArrowUp size={19} /></button>
          )}
        </div>
        {generating ? <OperationProgressPanel progress={progress} compact /> : <div className="composer-meta" id="composer-description"><span><SelectedIcon size={12} />{selected.description}</span><span>{value.length.toLocaleString('ru-RU')} знаков · черновик сохранён</span><span className="composer-shortcut">Ctrl + Enter — отправить</span></div>}
      </div>
    </div>
  )
})
