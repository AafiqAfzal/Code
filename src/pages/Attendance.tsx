import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { db } from '../db/schema'
import { useClasses, useGroups, useMyGroups, useSettings, useStudents } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { MONTHS, fmtDate, fullName, genderClass } from '../lib/format'

const MONTH_NUM: Record<string, number> = { září: 9, říjen: 10, listopad: 11, prosinec: 12, leden: 1, únor: 2, březen: 3, duben: 4, květen: 5, červen: 6 }

export function AttendancePage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const groups = useGroups()
  const myGroups = useMyGroups()
  const classes = useClasses()
  const students = useStudents()
  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const [month, setMonth] = useState('')
  const sel = groupId ? `g${groupId}` : classId ? `c${classId}` : ''
  const group = groups.find((g) => g.id === groupId)
  const roster = useMemo(() => group ? students.filter((s) => group.studentIds.includes(s.id)) : classId ? students.filter((s) => s.classId === classId) : [], [group, classId, students])
  const logs = useLiveQuery(async () => {
    if (!groupId && !classId) return []
    const all = groupId ? await db.lessonLogs.where('groupId').equals(groupId).toArray() : await db.lessonLogs.where('classId').equals(classId!).toArray()
    return all.sort((a, b) => a.date.localeCompare(b.date) || (a.lessonNumber ?? 0) - (b.lessonNumber ?? 0))
  }, [groupId, classId]) ?? []
  const filtered = month ? logs.filter((l) => Number(l.date.slice(5, 7)) === MONTH_NUM[month]) : logs
  const absent = (sid: number) => filtered.filter((l) => l.absentStudentIds.includes(sid))
  const title = `Docházka ${group?.name ?? classes.find((c) => c.id === classId)?.name ?? ''}${month ? ` – ${month}` : ''} ${settings?.schoolYear ?? ''}`

  const exportXlsx = () => {
    const header = ['Příjmení', 'Jméno', ...filtered.map((l) => `${fmtDate(l.date, 'd.M.')}${l.lessonNumber ? ` (${l.lessonNumber}.h)` : ''}`), 'Zameškáno', 'Z celkem', '%']
    const rows = roster.map((s) => { const a = absent(s.id).length; return [s.lastName, s.firstName, ...filtered.map((l) => (l.absentStudentIds.includes(s.id) ? 'A' : '')), a, filtered.length, filtered.length ? Math.round((a / filtered.length) * 100) : 0] })
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[title], [], header, ...rows]), 'Docházka')
    XLSX.writeFile(wb, `${title.replace(/[^\w\dáčďéěíňóřšťúůýž .-]/gi, '')}.xlsx`)
  }

  return (
    <div>
      <PageHeader title="Docházka" subtitle="Absence podle zápisů z hodin" actions={
        <>
          <select className="input w-auto" value={sel} onChange={(e) => { const v = e.target.value; setParams(v.startsWith('g') ? { groupId: v.slice(1) } : v ? { classId: v.slice(1) } : {}) }}>
            <option value="">— vyberte —</option>
            <optgroup label="Skupiny">{myGroups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>
            <optgroup label="Třídy">{classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>
          </select>
          <select className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)}><option value="">Celý rok</option>{MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
          <button className="btn-secondary" disabled={!roster.length} onClick={exportXlsx}><Download size={16} /> Export XLSX</button>
          <button className="btn-secondary" disabled={!roster.length} onClick={() => window.print()}>Tisk</button>
        </>
      } />
      {!sel && <div className="card card-body text-sm text-slate-500">Vyberte skupinu nebo třídu. Absence se berou ze <Link to="/zapisy" className="underline text-blue-700">zápisů z hodin</Link>.</div>}
      {sel && (
        <div className="card overflow-x-auto">
          <div className="px-4 py-2 text-sm text-slate-600 border-b border-slate-200">{filtered.length} zapsaných hodin{month ? ` v měsíci ${month}` : ''}</div>
          <table className="table whitespace-nowrap">
            <thead>
              <tr>
                <th className="sticky left-0 bg-slate-50 z-10">Žák</th>
                {filtered.map((l) => <th key={l.id} className="text-center font-normal" title={l.topic}><div>{fmtDate(l.date, 'd.M.')}</div><div className="text-[10px] text-slate-400">{l.lessonNumber ? `${l.lessonNumber}. h` : ''}</div></th>)}
                <th className="text-center">Zameškáno</th>
                <th className="text-center">%</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const a = absent(s.id)
                const pct = filtered.length ? Math.round((a.length / filtered.length) * 100) : 0
                return (
                  <tr key={s.id}>
                    <td className="sticky left-0 bg-white z-10 font-medium"><Link to={`/zaci/${s.id}`} className={`hover:underline ${genderClass(s.gender)}`}>{fullName(s)}</Link></td>
                    {filtered.map((l) => <td key={l.id} className="text-center">{l.absentStudentIds.includes(s.id) ? <span className="inline-block rounded bg-red-100 px-1.5 text-xs font-bold text-red-700">A</span> : <span className="text-slate-200">·</span>}</td>)}
                    <td className={`text-center font-bold ${a.length ? 'text-red-700' : 'text-slate-400'}`}>{a.length} h</td>
                    <td className={`text-center ${pct >= 25 ? 'text-red-700 font-bold' : pct >= 10 ? 'text-orange-600' : 'text-slate-500'}`}>{pct} %</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
