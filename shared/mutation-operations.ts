const MUTATION_OPERATION_NAMES = new Set([
  'add', 'create', 'new', 'update', 'change', 'patch', 'upsert', 'remove', 'delete',
  'complete', 'completed', 'fail', 'failed', 'resolve', 'resolved', 'break', 'broken',
  'cancel', 'cancelled', 'operation',
  'добавить', 'создать', 'новый', 'обновить', 'обновление', 'изменить', 'изменение',
  'удалить', 'удаление', 'завершить', 'завершено', 'выполнить', 'выполнено',
  'провалить', 'провалено', 'решить', 'разрешить', 'нарушить', 'разорвать',
  'отменить', 'отменено', 'операция',
])

/** True only for exact service-operation tokens, never for a phrase containing one. */
export function isMutationOperationName(value: string | undefined): boolean {
  if (!value?.trim()) return false
  const normalized = value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .replace(/[._/-]+/gu, ' ')
    .replace(/[^\p{L}\p{N} ]+/gu, '')
    .replace(/\s+/gu, ' ')
  return MUTATION_OPERATION_NAMES.has(normalized)
}
