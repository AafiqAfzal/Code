import { useLiveQuery } from 'dexie-react-hooks'
import { db, type GradingScale, type Settings } from '../db/schema'
import { byName } from '../lib/format'

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get(1), [])
}
export function useSubjects() {
  return useLiveQuery(() => db.subjects.orderBy('name').toArray(), []) ?? []
}
export function useClasses() {
  return useLiveQuery(() => db.classes.orderBy('name').toArray(), []) ?? []
}
export function useGroups() {
  return useLiveQuery(() => db.groups.orderBy('name').toArray(), []) ?? []
}
/** Jen skupiny, které učím já (bez skupin kolegů). */
export function useMyGroups() {
  return useGroups().filter((g) => g.mine !== false)
}
export function useStudents(activeOnly = true) {
  return useLiveQuery(async () => {
    const all = await db.students.toArray()
    return (activeOnly ? all.filter((s) => s.active) : all).sort(byName)
  }, [activeOnly]) ?? []
}
export function useCategories() {
  return useLiveQuery(() => db.gradeCategories.orderBy('order').toArray(), []) ?? []
}
export function useScale(): GradingScale {
  return useLiveQuery(() => db.gradingScales.get(1), []) ?? { id: 1, name: '', thresholds: [90, 75, 50, 30], rulesText: '' }
}
