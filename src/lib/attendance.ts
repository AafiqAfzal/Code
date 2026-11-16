import type { Group, LessonLog, Student } from '../db/schema'

/**
 * Týká se zápis z hodiny žáka? Hodina celé třídy (classId) se týká žáků třídy, hodina skupiny
 * (i připojené spojené skupiny – např. když kolegyně chybí) žáků, kteří v ní jsou.
 */
export function lessonForStudent(l: LessonLog, s: Pick<Student, 'id' | 'classId'>, groupsById: Map<number, Group>): boolean {
  if (l.groupId == null && (l.extraGroupIds ?? []).length === 0) return l.classId != null && l.classId === s.classId
  return [l.groupId, ...(l.extraGroupIds ?? [])].some((gid) => gid != null && !!groupsById.get(gid)?.studentIds.includes(s.id))
}
