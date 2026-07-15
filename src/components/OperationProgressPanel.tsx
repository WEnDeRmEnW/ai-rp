import { CheckCircle2, LoaderCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { OperationProgress } from '../../shared/types'

const stageLabels: Record<string, string> = {
  queued: 'В очереди',
  connecting: 'Подключение',
  preparing: 'Подготовка',
  'world-simulation': 'Живой мир',
  directing: 'План сцены',
  progression: 'Прогрессия',
  drafting: 'Написание',
  critic: 'Редактура',
  'consequence-audit': 'Проверка последствий',
  memory: 'Долгая память',
  concept: 'Разбор замысла',
  canon: 'Проверка канона',
  architecture: 'Архитектура мира',
  quality: 'Контроль качества',
  assembling: 'Сборка мира',
  finalizing: 'Финальная сборка',
  complete: 'Готово',
  'reading-state': 'Чтение состояния',
  'planning-edit': 'План корректировки',
  'validating-edit': 'Проверка изменений',
  'finalizing-edit': 'Применение',
}

export function OperationProgressPanel({ progress, compact = false }: { progress?: OperationProgress; compact?: boolean }) {
  const value = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 1)))
  const ready = value >= 100
  const style = { '--operation-progress': `${value}%` } as CSSProperties
  return <div className={`operation-progress ${compact ? 'operation-progress--compact' : ''} ${ready ? 'is-complete' : ''}`} aria-live="polite">
    <div className="operation-progress__ring" style={style} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      {ready ? <CheckCircle2 size={compact ? 16 : 20} /> : compact ? <LoaderCircle className="spin" size={15} /> : <strong>{value}%</strong>}
    </div>
    <div className="operation-progress__copy">
      <div><strong>{stageLabels[progress?.stage ?? 'queued'] ?? progress?.stage ?? 'Подготовка'}</strong>{!compact && <span>{value}%</span>}</div>
      <p>{progress?.detail ?? 'Подготавливаем задачу…'}</p>
      <div className="operation-progress__track"><i style={{ width: `${value}%` }} /></div>
      {!compact && progress?.totalSteps && <small>Этап {Math.min(progress.completedSteps ?? 1, progress.totalSteps)} из {progress.totalSteps}</small>}
    </div>
  </div>
}
