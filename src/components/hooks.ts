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
/**
 * Co učím v daném předmětu: moje skupiny předmětu + třídy, které v něm podle
 * rozvrhu učím vcelku. Bez rozvrhu se nabídnou všechny třídy (pokud nejsou skupiny).
 */
export function useTeachingUnits(subjectId?: number) {
  const myGroups = useMyGroups()
  const classes = useClasses()
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const groups = myGroups.filter((g) => !g.subjectId || g.subjectId === subjectId)
  const taught = new Set(slots.filter((s) => s.subjectId === subjectId && s.classId && !s.groupId).map((s) => s.classId))
  const units = taught.size ? classes.filter((c) => taught.has(c.id)) : groups.length ? [] : classes
  return { groups, classes: units }
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
