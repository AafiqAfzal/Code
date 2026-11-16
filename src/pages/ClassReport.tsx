import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { db, type Assessment, type ReportNote } from '../db/schema'
import { useClasses, useGroups, useScale, useSettings, useStudents, useSubjects, useTeachingUnits } from '../components/hooks'
import { PageHeader } from '../components/ui'
import { byName, fmtDate, fmtNum, fullName } from '../lib/format'
import { effectiveGrade, proposedGrade, weightedAverage } from '../lib/grading'
import { REPORT_PERIODS, REPORT_PERIOD_LABEL, currentReportPeriod, periodRange, type ReportPeriod } from '../lib/terms'

interface Column { key: string; date: string; title: string; weight: number; maxPoints?: number }
const keyOf = (a: Assessment) => `${a.date}|${a.title}|${a.categoryId}`

/** Report třídy na třídní schůzky: přehled celé třídy + kartičky pro rodiče s poznámkou. */
export function ClassReportPage() {
  const [params, setParams] = useSearchParams()
  const settings = useSettings()
  const subjects = useSubjects()
  const groups = useGroups()
  const classes = useClasses()
  const allStudents = useStudents()
  const scale = useScale()

  const groupId = Number(params.get('groupId')) || undefined
  const classId = Number(params.get('classId')) || undefined
  const group = groups.find((g) => g.id === groupId)
  const subjectId = Number(params.get('subjectId')) || group?.subjectId || settings?.defaultSubjectId || subjects[0]?.id
  const units = useTeachingUnits(subjectId)
  const [period, setPeriod] = useState<ReportPeriod | null>(null)
  const activePeriod: ReportPeriod = period ?? currentReportPeriod(settings)
  const { from, to } = periodRange(activePeriod, settings)
  const schoolYear = settings?.schoolYear ?? ''
  const [show, setShow] = useState({ overview: true, cards: true })

  // bez výběru → první skupina/třída předmětu
  useEffect(() => {
    if (!units.loaded) return
    const fits = (groupId && units.allGroups.some((g) => g.id === groupId)) || (classId && units.allClasses.some((c) => c.id === classId))
    if (fits) return
    const first: Record<string, string> | null = units.groups[0] ? { groupId: String(units.groups[0].id) } : units.classes[0] ? { classId: String(units.classes[0].id) } : null
    if (first) setParams({ subjectId: String(subjectId ?? ''), ...first }, { replace: true })
  }, [units.loaded, units.groups, units.classes, units.allGroups, units.allClasses, groupId, classId, subjectId, setParams])

  const roster = useMemo(() => (group ? allStudents.filter((s) => group.studentIds.includes(s.id)) : classId ? allStudents.filter((s) => s.classId === classId) : []).sort(byName), [group, classId, allStudents])
  const ids = roster.map((s) => s.id)

  const data = useLiveQuery(async () => {
    if (!subjectId || !ids.length) return null
    const inRange = (d: string) => d >= from && d <= to
    const assessments = (await db.assessments.where('subjectId').equals(subjectId).toArray()).filter((a) => ids.includes(a.studentId) && inRange(a.date))
    // odučené hodiny této skupiny/třídy v předmětu (i spojené hodiny, kdy byla skupina připojená)
    const logs = (await db.lessonLogs.toArray()).filter((l) => inRange(l.date) && l.subjectId === subjectId && l.kind !== 'suplovani'
      && (groupId ? l.groupId === groupId || !!l.extraGroupIds?.includes(groupId) : l.classId === classId))
    const notes = (await db.studentNotes.toArray()).filter((n) => ids.includes(n.studentId) && inRange(n.date))
    const reportNotes = await db.reportNotes.where('[subjectId+period+schoolYear]').equals([subjectId, activePeriod, schoolYear]).toArray()
    return { assessments, logs, notes, reportNotes }
  }, [ids.join(','), subjectId, from, to, groupId, classId, activePeriod, schoolYear])

  const columns: Column[] = useMemo(() => {
    const map = new Map<string, Column>()
    for (const a of data?.assessments ?? []) if (!map.has(keyOf(a))) map.set(keyOf(a), { key: keyOf(a), date: a.date, title: a.title, weight: a.weight, maxPoints: a.maxPoints })
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title))
  }, [data?.assessments])

  const subject = subjects.find((s) => s.id === subjectId)
  const unitName = group?.name ?? classes.find((c) => c.id === classId)?.name ?? ''
  const taught = data?.logs.length ?? 0

  const rows = roster.map((s) => {
    const mine = (data?.assessments ?? []).filter((a) => a.studentId === s.id)
    const avg = weightedAverage(mine, scale)
    const prop = proposedGrade(avg)
    const abs = (data?.logs ?? []).filter((l) => l.absentStudentIds.includes(s.id)).length
    const pct = taught ? Math.round((abs / taught) * 100) : 0
    const notes = (data?.notes ?? []).filter((n) => n.studentId === s.id)
    const plus = notes.filter((n) => n.kind === 'pochvala').length
    const minus = notes.filter((n) => n.kind === 'napomenuti').length
    const hasN = mine.some((a) => a.absent)
    const note = data?.reportNotes.find((r) => r.studentId === s.id)
    const flags = [taught && pct >= 25 ? 'absence nad 25 %' : '', hasN ? 'chybí hodnocení (N)' : '', prop != null && prop >= 4 ? `návrh ${prop}` : '', minus >= 2 ? `${minus}× napomenutí` : ''].filter(Boolean)
    const level = (taught && pct >= 25) || (prop != null && prop >= 4) ? 'warn' : flags.length ? 'mild' : ''
    return { s, mine, avg, prop, abs, pct, plus, minus, note, flags, level, lastNote: notes.sort((a, b) => b.date.localeCompare(a.date))[0] }
  })
  const avgs = rows.map((r) => r.avg).filter((x): x is number => x != null)
  const groupAvg = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : undefined
  const avgAbs = taught && rows.length ? Math.round((rows.reduce((a, r) => a + r.abs, 0) / rows.length / taught) * 1000) / 10 : 0

  const saveNote = async (studentId: number, text: string, existing?: ReportNote) => {
    if (!subjectId) return
    const t = text.trim()
    if (existing) { if (t) await db.reportNotes.update(existing.id, { text: t, updatedAt: new Date().toISOString() }); else await db.reportNotes.delete(existing.id) }
    else if (t) await db.reportNotes.add({ studentId, subjectId, period: activePeriod, schoolYear, text: t, updatedAt: new Date().toISOString() })
  }

  const cell = (a?: Assessment) => {
    if (!a) return <span className="text-slate-300">·</span>
    if (a.absent) return <b>N</b>
    const g = effectiveGrade(a, scale)
    return <><b>{g ?? ''}</b>{a.points != null && a.maxPoints ? <span className="block text-[6.5pt] leading-none text-slate-600">{fmtNum(a.points)}/{a.maxPoints}</span> : null}</>
  }
  const header = (kind: string) => (
    <div className="flex items-end justify-between border-b-2 border-black pb-1 mb-2">
      <div>
        <div className="text-[7.5pt] uppercase tracking-wide">{kind}{schoolYear ? ` · školní rok ${schoolYear}` : ''}</div>
        <h1 className="text-[14pt] font-bold leading-tight">{unitName} · {subject?.name}</h1>
      </div>
      <div className="text-right text-[8pt] leading-snug">Období: <b>{REPORT_PERIOD_LABEL[activePeriod]}</b> ({fmtDate(from)} – {fmtDate(to)})<br />{[settings?.teacherName && `Vyučující: ${settings.teacherName}`, settings?.schoolName].filter(Boolean).join(' · ')}</div>
    </div>
  )
  const dist = [1, 2, 3, 4, 5].map((g) => `${g}: ${rows.filter((r) => r.prop === g).length}×`).join('  ')

  const overview = (
    <div className="text-[8.5pt] text-black">
      {header('Přehled třídy pro třídní schůzky')}
      <div className="mb-2 flex flex-wrap gap-1.5">
        {[[String(rows.length), 'žáků'], [groupAvg != null ? fmtNum(groupAvg) : '—', 'průměr skupiny'], [String(taught), 'odučených hodin'], [`${fmtNum(avgAbs, 1)} %`, 'průměrná absence'], [dist, 'rozložení návrhů'], [String(rows.filter((r) => r.flags.length).length), 'k projednání']].map(([v, l]) => (
          <div key={l} className="rounded border border-slate-400 px-2 py-0.5"><b className="block text-[10pt] whitespace-pre">{v}</b><span className="text-[6.5pt] uppercase text-slate-600">{l}</span></div>
        ))}
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <table className="w-full border-collapse [&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black [&_td]:px-1 [&_td]:py-0.5 [&_th]:px-1 [&_th]:py-0.5">
          <thead>
            <tr className="bg-slate-100 text-[6.8pt] font-semibold">
              <th className="w-5">č.</th>
              <th className="text-left">Žák</th>
              {columns.map((c) => <th key={c.key} className="w-9 text-center leading-tight font-semibold">{fmtDate(c.date, 'd.M.')}<span className="block font-normal">{c.title}</span><span className="block font-normal text-slate-600">v{fmtNum(c.weight)}{c.maxPoints ? ` · /${c.maxPoints}` : ''}</span></th>)}
              <th className="w-10">Průměr</th>
              <th className="w-9">Návrh</th>
              <th className="w-14">Absence<span className="block font-normal">hod. / %</span></th>
              <th className="w-10">Poch./ napom.</th>
              <th className="text-left">Poznámka pro rodiče</th>
              <th className="w-28 text-left">K projednání</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.s.id} className={`break-inside-avoid ${r.level === 'warn' ? 'bg-red-50' : r.level === 'mild' ? 'bg-amber-50' : ''}`}>
                <td className="text-center">{i + 1}</td>
                <td className="whitespace-nowrap font-semibold">{fullName(r.s)}{r.s.tags.map((t) => <span key={t} className="ml-1 rounded border border-purple-600 px-0.5 text-[6.5pt] text-purple-700">{t}</span>)}</td>
                {columns.map((c) => <td key={c.key} className="text-center">{cell(r.mine.find((a) => keyOf(a) === c.key))}</td>)}
                <td className="text-center font-bold">{r.avg != null ? fmtNum(r.avg) : '—'}</td>
                <td className="text-center font-bold">{r.prop ?? ''}</td>
                <td className="whitespace-nowrap text-center">{taught ? `${r.abs} / ${r.pct} %` : r.abs}</td>
                <td className="whitespace-nowrap text-center">{r.plus ? `+${r.plus}` : ''}{r.plus && r.minus ? ' ' : ''}{r.minus ? `−${r.minus}` : ''}</td>
                <td className="text-[7.3pt]">{r.note?.text ?? ''}</td>
                <td className="text-[7pt]">{r.flags.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[7pt] text-slate-700">Body: známka z bodů podle škály ({scale.thresholds.join(' / ')} %). N = nehodnocen (chyběl). Absence = zameškané hodiny z {taught} odučených podle zápisů z hodin. Červeně: návrh 4–5 nebo absence nad 25 %, žlutě: jiný důvod k projednání. <b>Obsahuje údaje o všech žácích – jen pro potřebu vyučujícího, rodičům nepředávat.</b></p>
    </div>
  )

  const cards = (
    <div className="grid grid-cols-2 text-[8.5pt] text-black">
      {rows.map((r) => (
        <div key={r.s.id} className="break-inside-avoid border border-dashed border-slate-400 px-[7mm] py-[5mm]">
          <div className="text-[10.5pt] font-bold">{fullName(r.s)}</div>
          <div className="mb-1 text-[7.5pt] text-slate-600">{[subject?.name, unitName, `${REPORT_PERIOD_LABEL[activePeriod]} ${schoolYear}`, settings?.teacherName].filter(Boolean).join(' · ')}</div>
          <table className="w-full [&_td]:border-b [&_td]:border-slate-200 [&_td]:py-px">
            <tbody>
              {r.mine.slice().sort((a, b) => a.date.localeCompare(b.date)).map((a) => (
                <tr key={a.id}><td className="w-12">{fmtDate(a.date, 'd. M.')}</td><td>{a.title}</td><td className="text-right whitespace-nowrap"><b>{a.absent ? 'N' : effectiveGrade(a, scale) ?? ''}</b>{!a.absent && a.points != null && a.maxPoints ? ` (${fmtNum(a.points)}/${a.maxPoints})` : ''}</td></tr>
              ))}
              {r.mine.length === 0 && <tr><td className="text-slate-500">V tomto období zatím bez hodnocení.</td></tr>}
            </tbody>
          </table>
          <div className="mt-1">Vážený průměr: <b>{r.avg != null ? fmtNum(r.avg) : '—'}</b>{taught ? <> · absence {r.abs} h z {taught}</> : null}</div>
          {r.note?.text && <div className="mt-1 whitespace-pre-wrap"><b>Poznámka:</b> {r.note.text}</div>}
          <div className="mt-5 border-t border-dashed border-black pt-px text-[7pt] text-slate-600">Podpis rodiče</div>
        </div>
      ))}
    </div>
  )

  return (
    <div>
      {/* celý report na šířku */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm; } }'}</style>
      <div className="print:hidden">
        <PageHeader title="Report na třídní schůzky" subtitle="Přehled celé třídy a kartičky pro rodiče s vaší poznámkou" actions={
          <button className="btn-primary" disabled={!rows.length || (!show.overview && !show.cards)} onClick={() => window.print()}><Printer size={16} /> Tisk</button>
        } />
        <div className="card card-body mb-4 flex flex-wrap items-end gap-3">
          <div><div className="label">Předmět</div>
            <select className="input w-auto" value={subjectId ?? ''} onChange={(e) => setParams({ subjectId: e.target.value })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><div className="label">Třída / skupina</div>
            <select className="input w-auto" value={groupId ? `g${groupId}` : classId ? `c${classId}` : ''} onChange={(e) => { const v = e.target.value; setParams({ subjectId: String(subjectId ?? ''), ...(v.startsWith('g') ? { groupId: v.slice(1) } : { classId: v.slice(1) }) }) }}>
              {units.groups.length > 0 && <optgroup label="Skupiny">{units.groups.map((g) => <option key={g.id} value={`g${g.id}`}>{g.name}</option>)}</optgroup>}
              {units.classes.length > 0 && <optgroup label="Třídy">{units.classes.map((c) => <option key={c.id} value={`c${c.id}`}>{c.name}</option>)}</optgroup>}
              {groupId && !units.groups.some((g) => g.id === groupId) && group && <option value={`g${groupId}`}>{group.name}</option>}
              {classId && !units.classes.some((c) => c.id === classId) && <option value={`c${classId}`}>{classes.find((c) => c.id === classId)?.name}</option>}
            </select></div>
          <div><div className="label">Období</div>
            <select className="input w-auto" value={activePeriod} onChange={(e) => setPeriod(e.target.value as ReportPeriod)}>{REPORT_PERIODS.map((p) => <option key={p} value={p}>{REPORT_PERIOD_LABEL[p]}</option>)}</select></div>
          <div className="pb-2 text-xs text-slate-500">{fmtDate(from)} – {fmtDate(to)}</div>
          <div className="flex gap-3 pb-1 text-sm">
            <label className="flex items-center gap-1"><input type="checkbox" checked={show.overview} onChange={(e) => setShow({ ...show, overview: e.target.checked })} /> přehled třídy</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={show.cards} onChange={(e) => setShow({ ...show, cards: e.target.checked })} /> kartičky pro rodiče</label>
          </div>
        </div>
        {!rows.length && <div className="card card-body text-sm text-slate-500">Vyberte předmět a třídu nebo skupinu se žáky.</div>}
        {rows.length > 0 && (
          <>
            <div className="card card-body mb-4">{overview}</div>
            <div className="card mb-4">
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <h2 className="card-title">Poznámky pro rodiče na kartičky</h2>
                <span className="text-xs text-slate-500">Ukládá se samo po opuštění pole · {REPORT_PERIOD_LABEL[activePeriod]} {schoolYear}</span>
              </div>
              <ul className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <li key={`${r.s.id}-${activePeriod}-${subjectId}-${r.note?.id ?? 'nova'}`} className="flex flex-wrap items-start gap-3 px-4 py-2 text-sm">
                    <div className="w-48 shrink-0">
                      <div className="font-medium">{fullName(r.s)}</div>
                      <div className="text-xs text-slate-500">průměr {r.avg != null ? fmtNum(r.avg) : '—'}{r.flags.length ? ` · ${r.flags.join(', ')}` : ''}</div>
                    </div>
                    <textarea className="input min-w-64 flex-1" rows={2} placeholder="Poznámka na kartičku (např. zlepšení, co procvičit, dopsat test…)" defaultValue={r.note?.text ?? ''}
                      onBlur={(e) => { if (e.target.value.trim() !== (r.note?.text ?? '')) saveNote(r.s.id, e.target.value, r.note) }} />
                    {r.lastNote && !r.note && (
                      <button className="text-xs text-blue-700 hover:underline" title={r.lastNote.text} onClick={() => saveNote(r.s.id, r.lastNote!.text)}>vložit poslední poznámku ({fmtDate(r.lastNote.date, 'd. M.')})</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
      {/* tisk */}
      {rows.length > 0 && (
        <div className="hidden print:block">
          {show.overview && <div className={show.cards ? 'break-after-page' : ''}>{overview}</div>}
          {show.cards && cards}
        </div>
      )}
    </div>
  )
}
