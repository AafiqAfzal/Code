import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Printer, RefreshCw, Save } from 'lucide-react'
import { db, type WorkDay, type WorkMonth } from '../db/schema'
import { useSettings } from '../components/hooks'
import { Field, PageHeader, Toast, useToast } from '../components/ui'
import { SettingsTabs } from '../components/Layout'
import { WEEKDAYS_SHORT, fmtDate } from '../lib/format'
import { holidayName, schoolHolidayName } from '../lib/holidays'
import { WORK_CODES, WORK_CODE_LABEL, addHours, autoFillMonth, dateOf, daysInMonth, fillTemplate, monthTotals } from '../lib/workReport'
import { downloadBlob } from '../lib/backup'

const thisMonth = () => new Date().toISOString().slice(0, 7)

export function WorkReportPage() {
  const settings = useSettings()
  const { message, show } = useToast()
  const [month, setMonth] = useState(thisMonth())
  const slots = useLiveQuery(() => db.timetable.toArray(), []) ?? []
  const changes = useLiveQuery(() => db.timetableChanges.toArray(), []) ?? []
  const schoolHolidays = useLiveQuery(() => db.schoolHolidays.toArray(), []) ?? []
  const template = useLiveQuery(() => db.documents.where('kind').equals('epd-template').first(), [])
  const saved = useLiveQuery(async () => (await db.workMonths.where('month').equals(month).first()) ?? null, [month])
  const [draft, setDraft] = useState<Omit<WorkMonth, 'id'> | null>(null)
  const [dirty, setDirty] = useState(false)

  // načíst uložený měsíc, nebo předvyplnit z rozvrhu
  useEffect(() => {
    if (saved === undefined || !settings) return
    if (saved) { setDraft({ ...saved }); setDirty(false); return }
    setDraft({
      month, name: settings.teacherName, position: settings.epdPosition ?? '', personalNumber: settings.epdPersonalNumber ?? '', workload: settings.epdWorkload ?? '',
      days: autoFillMonth({ month, slots, changes, schoolHolidays, settings }), updatedAt: new Date().toISOString(),
    })
    setDirty(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, month, settings?.id, slots.length, changes.length, schoolHolidays.length])

  const totals = useMemo(() => (draft ? monthTotals(draft.days) : null), [draft])
  const n = daysInMonth(month)
  const setDay = (d: number, patch: Partial<WorkDay>) => { if (!draft) return; setDraft({ ...draft, days: { ...draft.days, [d]: { ...draft.days[d], ...patch } } }); setDirty(true) }
  const setHeader = (patch: Partial<WorkMonth>) => { if (!draft) return; setDraft({ ...draft, ...patch }); setDirty(true) }
  const save = async () => {
    if (!draft) return
    const data = { ...draft, updatedAt: new Date().toISOString() }
    if (saved) await db.workMonths.update(saved.id, data); else await db.workMonths.add(data)
    await db.settings.update(1, { epdPosition: draft.position, epdPersonalNumber: draft.personalNumber, epdWorkload: draft.workload })
    setDirty(false); show('Výkaz uložen.')
  }
  const refill = () => { if (!draft || !settings) return; if (!confirm('Přepsat dny podle rozvrhu? Ruční úpravy se ztratí.')) return; setDraft({ ...draft, days: autoFillMonth({ month, slots, changes, schoolHolidays, settings }) }); setDirty(true) }
  const exportXlsx = async () => {
    if (!draft || !template) return
    try {
      const blob = await fillTemplate(template.blob, { month, name: draft.name, position: draft.position, personalNumber: draft.personalNumber, workload: draft.workload }, draft.days)
      downloadBlob(blob, `Evidence pracovni doby ${month}.xlsx`); show('Vyplněná šablona stažena.')
    } catch (e) { show(`Export selhal: ${(e as Error).message}`) }
  }
  const dayInfo = (d: number) => {
    const date = dateOf(month, d)
    const wd = new Date(date).getDay()
    return { date, weekend: wd === 0 || wd === 6, wdShort: WEEKDAYS_SHORT[(wd + 6) % 7], holiday: holidayName(date), vacation: schoolHolidayName(date, schoolHolidays) }
  }
  const num = (v?: number) => (v == null || Number.isNaN(v) ? '' : v)
  const cell = (d: number, key: keyof WorkDay, type: 'text' | 'number' | 'time' = 'text', w = 'w-14') => {
    const v = draft?.days[d]?.[key]
    return <input className={`input px-1 py-0.5 text-xs ${w}`} type={type === 'number' ? 'number' : 'text'} step={type === 'number' ? 0.5 : undefined} value={type === 'number' ? num(v as number) : ((v as string) ?? '')}
      onChange={(e) => setDay(d, { [key]: type === 'number' ? (e.target.value === '' ? undefined : Number(e.target.value)) : e.target.value || undefined })} />
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader title="Evidence pracovní doby" subtitle="Měsíční výkaz vyplněný z rozvrhu; upravte a stáhněte školní šablonu" actions={
          <>
            <input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button className="btn-secondary" onClick={refill}><RefreshCw size={16} /> Vyplnit z rozvrhu</button>
            <button className="btn-secondary" onClick={() => window.print()}><Printer size={16} /> Tisk</button>
            <button className="btn-secondary" disabled={!template} title={template ? '' : 'Nejprve nahrajte šablonu v Nastavení'} onClick={exportXlsx}><Download size={16} /> Stáhnout vyplněnou šablonu (XLSX)</button>
            <button className={dirty ? 'btn-primary' : 'btn-secondary'} onClick={save}><Save size={16} /> Uložit</button>
          </>
        } />
        <SettingsTabs />
        {!template && <div className="mb-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Školní šablona výkazu není nahraná. Bez ní jde výkaz jen vytisknout z aplikace. Nahrajte ji v <Link to="/nastaveni" className="underline">Nastavení → Evidence pracovní doby</Link>.</div>}
        {draft && (
          <div className="card card-body mb-4 grid gap-3 md:grid-cols-5">
            <Field label="Jméno a příjmení"><input className="input" value={draft.name} onChange={(e) => setHeader({ name: e.target.value })} /></Field>
            <Field label="Pracovní zařazení"><input className="input" value={draft.position} onChange={(e) => setHeader({ position: e.target.value })} placeholder="učitel" /></Field>
            <Field label="Osobní číslo"><input className="input" value={draft.personalNumber} onChange={(e) => setHeader({ personalNumber: e.target.value })} /></Field>
            <Field label="Pracovní úvazek"><input className="input" value={draft.workload} onChange={(e) => setHeader({ workload: e.target.value })} placeholder="1,0" /></Field>
            <div className="text-xs text-slate-500 self-end">Odpracované dny: <b>{totals?.workedDays}</b> · přímá ped. práce: <b>{totals?.direct} h</b> · přespočetné: <b>{totals?.extra} h</b></div>
          </div>
        )}
      </div>

      {draft && (
        <>
          <div className="card overflow-x-auto no-print">
            <table className="table text-xs whitespace-nowrap">
              <thead><tr><th>Den</th><th>Začátek</th><th>Přímá ped.</th><th>Související</th><th>Přespočetné</th><th>Konec</th><th>Kód</th><th>od – do</th><th>Odpr. h</th><th>Přesčas</th><th>Mimošk. h</th><th>Mimošk. název</th><th>Webinář</th></tr></thead>
              <tbody>
                {Array.from({ length: n }, (_, i) => i + 1).map((d) => {
                  const info = dayInfo(d); const day = draft.days[d] ?? {}
                  const bg = info.holiday ? 'bg-rose-50' : info.vacation ? 'bg-emerald-50' : info.weekend ? 'bg-amber-50/60' : ''
                  return (
                    <tr key={d} className={bg}>
                      <td className="font-medium">{d}. <span className="text-slate-400">{info.wdShort}</span>{info.holiday && <span className="ml-1 text-rose-700" title={info.holiday}>svátek</span>}{info.vacation && !info.holiday && <span className="ml-1 text-emerald-700">{info.vacation}</span>}</td>
                      <td>{cell(d, 'start', 'time', 'w-16')}</td>
                      <td>{cell(d, 'direct', 'number')}</td>
                      <td>{cell(d, 'related', 'number')}</td>
                      <td>{cell(d, 'extra', 'number')}</td>
                      <td>{cell(d, 'end', 'time', 'w-16')}<button className="ml-1 text-[10px] text-blue-700 hover:underline" title="Dopočítat konec = začátek + denní hodiny" onClick={() => day.start && setDay(d, { end: addHours(day.start, settings?.epdDailyHours ?? 8) })}>=</button></td>
                      <td><select className="input px-1 py-0.5 text-xs w-20" value={day.code ?? ''} onChange={(e) => setDay(d, { code: e.target.value || undefined })}><option value="">—</option>{WORK_CODES.map((c) => <option key={c} value={c}>{c} – {WORK_CODE_LABEL[c]}</option>)}</select></td>
                      <td>{cell(d, 'codeNote', 'text', 'w-24')}</td>
                      <td className="text-center text-slate-600">{(day.direct ?? 0) + (day.related ?? 0) || ''}</td>
                      <td>{cell(d, 'overtime', 'number')}</td>
                      <td>{cell(d, 'activityHours', 'number')}</td>
                      <td>{cell(d, 'activityName', 'text', 'w-32')}</td>
                      <td>{cell(d, 'webinar', 'text', 'w-32')}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot><tr className="font-semibold"><td>Celkem</td><td></td><td className="px-2">{totals?.direct}</td><td className="px-2">{totals?.related}</td><td className="px-2">{totals?.extra}</td><td></td><td colSpan={2} className="text-slate-500 font-normal">{Object.entries(totals?.codes ?? {}).map(([c, k]) => `${c}: ${k}`).join(', ')}</td><td className="text-center">{totals?.worked}</td><td className="px-2">{totals?.overtime}</td><td className="px-2">{totals?.activity}</td><td colSpan={2}></td></tr></tfoot>
            </table>
            <p className="px-4 py-2 text-xs text-slate-400">Automatické vyplnění: přímá ped. práce = počet odučených hodin z rozvrhu (bez odpadlých), přespočetné = suplování, související = denní hodiny − přímá, kroužek = mimoškolní aktivita, svátek = Sv, prázdniny = kód z Nastavení. Výchozí začátek a denní hodiny nastavíte v Nastavení.</p>
          </div>

          {/* Tisková podoba: 2 strany na šířku jako školní šablona */}
          <PrintSheet draft={draft} month={month} n={n} dayInfo={dayInfo} totals={totals!} />
        </>
      )}
      <Toast message={message} />
    </div>
  )
}

function PrintSheet({ draft, month, n, dayInfo, totals }: { draft: Omit<WorkMonth, 'id'>; month: string; n: number; dayInfo: (d: number) => { holiday?: string; vacation?: string; weekend: boolean }; totals: ReturnType<typeof monthTotals> }) {
  const head = (
    <tr className="text-[9px]">
      <th className="border border-black px-1">Datum</th><th className="border border-black px-1">Začátek pracovní doby</th><th className="border border-black px-1">Počet hodin přímé ped. práce</th><th className="border border-black px-1">Počet hodin práce související s přímou ped. prací</th><th className="border border-black px-1">Počet přespočetných hodin</th><th className="border border-black px-1">Konec pracovní doby</th><th className="border border-black px-1">Lékař, D, Sa, OČR, DVPP<br />od – do</th><th className="border border-black px-1">Počet odpr. hodin</th><th className="border border-black px-1">Počet přesčas. hodin</th><th className="border border-black px-1">Mimoškolní aktivity<br />P</th><th className="border border-black px-1">N</th><th className="border border-black px-1">Webináře<br />jaké</th>
    </tr>
  )
  const row = (d: number) => {
    const day = draft.days[d] ?? {}
    const td = (v: unknown) => <td className="border border-black px-1 text-center h-5">{v == null || v === '' ? '' : String(v)}</td>
    return (
      <tr key={d} className="text-[10px]">
        {td(d)}{td(day.start)}{td(day.direct)}{td(day.related)}{td(day.extra)}{td(day.end)}{td(day.code ? `${day.code}${day.codeNote ? ` ${day.codeNote}` : ''}` : '')}{td((day.direct ?? 0) + (day.related ?? 0) || '')}{td(day.overtime)}{td(day.activityHours)}{td(day.activityName)}{td(day.webinar)}
      </tr>
    )
  }
  return (
    <div className="hidden print:block text-black">
      <style>{`@page { size: A4 landscape; margin: 12mm; }`}</style>
      <div className="break-after-page">
        <h1 className="text-center text-sm font-bold mb-2">EVIDENCE PRACOVNÍ DOBY A PRÁCE PŘESČAS PEDAGOGICKÝCH ZAMĚSTNANCŮ</h1>
        <table className="w-full text-[10px] mb-2"><tbody>
          <tr><td className="w-1/6 py-0.5">Jméno a příjmení</td><td className="w-1/3 border-b border-black">{draft.name}</td><td className="w-1/6 pl-4">Pracovní zařazení:</td><td className="w-1/3 border-b border-black">{draft.position}</td></tr>
          <tr><td className="py-0.5">Měsíc/rok</td><td className="border-b border-black">{month.slice(5, 7)}/{month.slice(2, 4)}</td><td className="pl-4">Pracovní úvazek</td><td className="border-b border-black">{draft.workload}</td></tr>
          <tr><td className="py-0.5">Osobní číslo</td><td className="border-b border-black">{draft.personalNumber}</td><td className="pl-4">Počet odpracovaných dní:</td><td className="border-b border-black">{totals.workedDays}</td></tr>
        </tbody></table>
        <table className="w-full border-collapse"><thead>{head}</thead><tbody>{Array.from({ length: Math.min(15, n) }, (_, i) => row(i + 1))}</tbody></table>
      </div>
      <div>
        <table className="w-full border-collapse"><thead>{head}</thead><tbody>
          {Array.from({ length: Math.max(0, n - 15) }, (_, i) => row(i + 16))}
          <tr className="text-[10px] font-semibold"><td className="border border-black px-1">Celkem</td><td className="border border-black" /><td className="border border-black text-center">{totals.direct}</td><td className="border border-black text-center">{totals.related}</td><td className="border border-black text-center">{totals.extra}</td><td className="border border-black" /><td className="border border-black" /><td className="border border-black text-center">{totals.worked}</td><td className="border border-black text-center">{totals.overtime}</td><td className="border border-black text-center">{totals.activity}</td><td className="border border-black" /><td className="border border-black" /></tr>
        </tbody></table>
        <p className="mt-2 text-[9px]">Pozn.: D – dovolená, Sa – samostudium, Sv – svátek, L – lékař, OČR – ošetřování člena rodiny</p>
        <div className="mt-4 flex justify-between text-[10px]">
          <div>Podpis vykazujícího: ____________________<br /><br />Schválila: ____________________</div>
          <table className="text-[10px]"><thead><tr>{['Samostudium', 'Dovolená', 'Svátek', 'Lékař', 'Očr', 'DVPP'].map((h) => <th key={h} className="border border-black px-2">{h}</th>)}</tr></thead><tbody><tr>{['Sa', 'D', 'Sv', 'L', 'OČR', 'DVPP'].map((c) => <td key={c} className="border border-black text-center">{totals.codes[c] ?? 0}</td>)}</tr></tbody></table>
        </div>
        <p className="mt-2 text-[9px] text-slate-500">Vytištěno z Pedagogického deníku · {fmtDate(new Date().toISOString().slice(0, 10))}{dayInfo(1).weekend ? '' : ''}</p>
      </div>
    </div>
  )
}
