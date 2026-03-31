/**
 * Zustand state update helpers for managing nested and complex state updates.
 * Eliminates boilerplate spread operators and makes state mutations more declarative.
 */

/**
 * Update a nested Record value without spreading the entire object.
 * @example
 * set((state) => ({
 *   activeFilePathByProject: updateRecord(state.activeFilePathByProject, projectId, filePath)
 * }))
 */
export function updateRecord<K extends string | number, V>(
  record: Record<K, V>,
  key: K,
  value: V
): Record<K, V> {
  return { ...record, [key]: value }
}

/**
 * Delete a key from a nested Record without spreading the entire object.
 * @example
 * set((state) => ({
 *   activeFilePathByProject: deleteFromRecord(state.activeFilePathByProject, projectId)
 * }))
 */
export function deleteFromRecord<K extends string | number, V>(
  record: Record<K, V>,
  key: K
): Record<K, V> {
  const updated = { ...record }
  delete updated[key]
  return updated
}

/**
 * Update or create a nested object property.
 * @example
 * set((state) => ({
 *   byProject: updateNestedObject(state.byProject, projectId, { isDirty: true })
 * }))
 */
export function updateNestedObject<K extends string | number, V extends Record<string, unknown>>(
  record: Record<K, V>,
  key: K,
  partial: Partial<V>
): Record<K, V> {
  return {
    ...record,
    [key]: {
      ...(record[key] ?? {}),
      ...partial,
    } as V,
  }
}

/**
 * Delete a key from a nested Record and return a new record without that key.
 * Used when removing a project removes all its associated state.
 * @example
 * set((state) => {
 *   const filteredByProject = filterRecord(state.byProject, key => key !== projectId)
 *   return { byProject: filteredByProject }
 * })
 */
export function filterRecord<K extends string | number, V>(
  record: Record<K, V>,
  predicate: (key: K) => boolean
): Record<K, V> {
  const filtered = {} as Record<K, V>
  for (const key in record) {
    if (predicate(key as K)) {
      filtered[key as K] = record[key as K]
    }
  }
  return filtered
}

/**
 * Map over Record values and return a new record.
 * @example
 * set((state) => ({
 *   byProject: mapRecord(state.byProject, (val) => ({ ...val, enabled: false }))
 * }))
 */
export function mapRecord<K extends string | number, V, U>(
  record: Record<K, V>,
  fn: (value: V, key: K) => U
): Record<K, U> {
  const mapped = {} as Record<K, U>
  for (const key in record) {
    mapped[key as K] = fn(record[key as K], key as K)
  }
  return mapped
}
