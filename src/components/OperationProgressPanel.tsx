import { CheckCircle2, LoaderCircle } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { OperationProgress } from '../../shared/types'

const stageLabels: Record<string, string> = {
  queued: 'В очереди',
  connecting: 'Подключение',
  preparing: 'Подготовка',
  'world-simulation': 'Живой мир',
  'event-director': 'Режиссёр событий',
  'event-compliance': 'Последствия события',
  directing: 'План сцены',
  'artifact-quality': 'Проверка особого предмета',
  'ability-quality': 'Проверка способностей',
  'ability-execution': 'Исполнение способностей',
  progression: 'Прогрессия',
  drafting: 'Написание',
  critic: 'Редактура',
  revision: 'Исправление сцены',
  'parallel-audit': 'Параллельная сверка',
  'agency-audit': 'Свобода героя',
  'consequence-audit': 'Проверка последствий',
  'style-audit': 'Проверка стиля',
  memory: 'Долгая память',
  concept: 'Разбор замысла',
  canon: 'Проверка канона',
  architecture: 'Архитектура мира',
  'world-core': 'Основа мира',
  'world-civilization': 'Цивилизации и законы',
  'world-characters': 'Жители мира',
  'world-legends': 'Легенды и эпохи',
  'world-narrative': 'Живые процессы',
  'world-interface': 'Интерфейс мира',
  'world-integrity': 'Связность мира',
  'world-section-rewrite': 'Точечное улучшение',
  quality: 'Контроль качества',
  assembling: 'Сборка мира',
  finalizing: 'Финальная сборка',
  complete: 'Готово',
  'reading-state': 'Чтение состояния',
  'planning-edit': 'План корректировки',
  'validating-edit': 'Проверка изменений',
  'finalizing-edit': 'Применение',
}

function elapsedLabel(milliseconds?: number) {
  if (milliseconds === undefined || milliseconds < 1_000) return undefined
  const seconds = Math.round(milliseconds / 1_000)
  if (seconds < 60) return `${seconds} с`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} мин ${seconds % 60} с`
}

export function OperationProgressPanel({ progress, compact = false }: { progress?: OperationProgress; compact?: boolean }) {
  const value = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 1)))
  const ready = value >= 100
  const elapsed = elapsedLabel(progress?.elapsedMs)
  const style = { '--operation-progress': `${value}%` } as CSSProperties
  return <div className={`operation-progress ${compact ? 'operation-progress--compact' : ''} ${ready ? 'is-complete' : ''}`} aria-live="polite">
    <div className="operation-progress__ring" style={style} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      {ready ? <CheckCircle2 size={compact ? 16 : 20} /> : compact ? <LoaderCircle className="spin" size={15} /> : <strong>{value}%</strong>}
    </div>
    <div className="operation-progress__copy">
      <div><strong>{stageLabels[progress?.stage ?? 'queued'] ?? progress?.stage ?? 'Подготовка'}</strong>{!compact && <span>{value}%</span>}</div>
      <p>{progress?.detail ?? 'Подготавливаем задачу…'}</p>
      {!compact && progress?.parallelTasks?.length ? <div className="operation-progress__parallel">
        {progress.parallelTasks.map((task) => <span key={task}>{task}</span>)}
      </div> : null}
      <div className="operation-progress__track"><i style={{ width: `${value}%` }} /></div>
      {!compact && <small>
        {progress?.totalSteps ? `Этап ${Math.min(progress.completedSteps ?? 1, progress.totalSteps)} из ${progress.totalSteps}` : ''}
        {elapsed ? `${progress?.totalSteps ? ' · ' : ''}${elapsed}` : ''}
        {progress?.providerCalls ? ` · ИИ-запросов: ${progress.providerCalls}` : ''}
      </small>}
    </div>
  </div>
}
