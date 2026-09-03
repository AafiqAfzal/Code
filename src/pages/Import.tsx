import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, FileText, ClipboardList } from 'lucide-react'
import { db } from '../db/schema'
import { useCategories, useClasses, useGroups, useStudents, useSubjects } from '../components/hooks'
import { Field, PageHeader } from '../components/ui'
import { fmtDate, fullName, todayISO } from '../lib/format'
import { applyMapping, gradeFromClassName, guessMapping, parseWorkbook, splitFullName, type ColumnMapping, type ImportRow, type ParsedSheet } from '../lib/excelImport'
import { extractDocx, extractPlainText, type ExtractedItem } from '../lib/docxImport'

export function ImportPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'word' ? 'word' : params.get('tab') === 'znamky' ? 'znamky' : 'excel'
  return (
    <div>
      <PageHeader title="Import dat" subtitle="Seznamy žáků z Excelu (Škola online) a tematické plány z Wordu" />
      <div className="mb-4 flex gap-2 no-print">
        <button className={tab === 'excel' ? 'btn-primary' : 'btn-secondary'} onClick={() => setParams({ tab: 'excel' })}><FileSpreadsheet size={16} /> Žáci z Excelu</button>
        <button className={tab === 'word' ? 'btn-primary' : 'btn-secondary'} onClick={() => setParams({ tab: 'word' })}><FileText size={16} /> Tematický plán z Wordu</button>
        <button className={tab === 'znamky' ? 'btn-primary' : 'btn-secondary'} onClick={() => setParams({ tab: 'znamky' })}><ClipboardList size={16} /> Známky z Excelu</button>
      </div>
      {tab === 'excel' ? <ExcelImport /> : tab === 'word' ? <WordImport /> : <GradesImport />}
    </div>
  )
}

const FIELDS: { key: keyof ColumnMapping; label: string }[] = [
  { key: 'className', label: 'Třída' }, { key: 'lastName', label: 'Příjmení' }, { key: 'firstName', label: 'Jméno' },
  { key: 'fullName', label: 'Celé jméno (pokud je v jednom sloupci)' }, { key: 'group', label: 'Skupina' }, { key: 'catalogNumber', label: 'Číslo v katalogu' },
  { key: 'gradeLevel', label: 'Ročník' }, { key: 'birthDate', label: 'Datum narození' }, { key: 'citizenship', label: 'Státní občanství' },
]

function ExcelImport() {
  const navigate = useNavigate()
  const subjects = useSubjects()
  const classes = useClasses()
  const groups = useGroups()
  const students = useStudents(false)
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [lastNameFirst, setLastNameFirst] = useState(true)
  const [groupScope, setGroupScope] = useState<'grade' | 'class'>('class')
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined)
  const [defaultClass, setDefaultClass] = useState('')
  const [tagForeign, setTagForeign] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const sheet = sheets[sheetIdx]
  const rows: ImportRow[] = sheet ? applyMapping(sheet.rows, mapping, lastNameFirst) : []

  const onFile = async (f: File) => {
    const parsed = await parseWorkbook(f)
    setSheets(parsed); setSheetIdx(0); setMapping(guessMapping(parsed[0]?.headers ?? [])); setResult(null)
  }
  const selectSheet = (i: number) => { setSheetIdx(i); setMapping(guessMapping(sheets[i].headers)) }

  const doImport = async () => {
    setBusy(true)
    const subj = subjects.find((s) => s.id === (subjectId ?? subjects[0]?.id))
    let created = 0, updated = 0, newClasses = 0, newGroups = 0
    const classCache = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]))
    const groupCache = new Map(groups.map((g) => [g.name.toLowerCase(), g]))
    const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    await db.transaction('rw', db.classes, db.students, db.groups, async () => {
      for (const r of rows) {
        const cname = (r.className || defaultClass).trim()
        let classId: number | undefined
        if (cname) {
          classId = classCache.get(cname.toLowerCase())
          if (!classId) { classId = await db.classes.add({ name: cname, gradeLevel: r.gradeLevel || gradeFromClassName(cname) }); classCache.set(cname.toLowerCase(), classId); newClasses++ }
        }
        const isForeign = !!r.citizenship && !/^(cesk|czech|cr$|čr$)/i.test(fold(r.citizenship))
        const extraTags = tagForeign && isForeign ? ['OMJ'] : []
        const existing = students.find((s) => fold(s.lastName) === fold(r.lastName ?? '') && fold(s.firstName) === fold(r.firstName ?? '') && (!classId || !s.classId || s.classId === classId))
        let studentId: number
        if (existing) { studentId = existing.id; await db.students.update(studentId, { classId: classId ?? existing.classId, catalogNumber: r.catalogNumber ?? existing.catalogNumber, birthDate: r.birthDate ?? existing.birthDate, citizenship: r.citizenship ?? existing.citizenship, tags: Array.from(new Set([...existing.tags, ...extraTags])), active: true }); updated++ }
        else { studentId = await db.students.add({ firstName: r.firstName ?? '', lastName: r.lastName ?? '', classId, catalogNumber: r.catalogNumber, birthDate: r.birthDate, citizenship: r.citizenship, tags: extraTags, active: true }); created++ }
        if (r.group) {
          const grade = r.gradeLevel || (cname ? gradeFromClassName(cname) : 0)
          const gname = groupScope === 'class' && cname ? `${subj?.abbreviation ?? ''} ${cname} – sk. ${r.group}`.trim() : `${subj?.abbreviation ?? ''} ${grade ? `${grade}. r.` : ''} – sk. ${r.group}`.trim()
          let g = groupCache.get(gname.toLowerCase())
          if (!g) { const id = await db.groups.add({ name: gname, subjectId: subj?.id, gradeLevel: grade, studentIds: [] }); g = { id, name: gname, subjectId: subj?.id, gradeLevel: grade, studentIds: [] }; groupCache.set(gname.toLowerCase(), g); newGroups++ }
          if (!g.studentIds.includes(studentId)) { g.studentIds = [...g.studentIds, studentId]; await db.groups.update(g.id, { studentIds: g.studentIds }) }
        }
      }
    })
    setBusy(false)
    setResult(`Hotovo: ${created} nových žáků, ${updated} aktualizovaných, ${newClasses} nových tříd, ${newGroups} nových skupin.`)
  }

  return (
    <div className="space-y-4">
      <div className="card card-body">
        <p className="text-sm text-slate-600 mb-3">Nahrajte soubor .xlsx / .xls / .csv, např. export seznamu žáků ze Školy online. Aplikace sama pozná sloupce <b>Třída</b>, <b>Jméno</b>, <b>Příjmení</b>, <b>Skupina</b>, <b>Ročník</b>, <b>Datum narození</b> a <b>Občanství</b> (export „Karta žáka – seznam“); hodnota skupiny „-“ znamená bez skupiny; přiřazení lze upravit níže. Opakovaný import stejného žáka jej neduplikuje, jen aktualizuje.</p>
        <input type="file" accept=".xlsx,.xls,.csv,.ods" className="text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      {sheet && (
        <>
          <div className="card card-body grid gap-3 md:grid-cols-3">
            {sheets.length > 1 && <Field label="List"><select className="input" value={sheetIdx} onChange={(e) => selectSheet(Number(e.target.value))}>{sheets.map((s, i) => <option key={s.sheetName} value={i}>{s.sheetName} ({s.rows.length})</option>)}</select></Field>}
            {FIELDS.map((f) => (
              <Field key={f.key} label={f.label}>
                <select className="input" value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value || undefined })}>
                  <option value="">— nepoužít —</option>
                  {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ))}
            {mapping.fullName && <label className="text-sm flex items-center gap-2 pt-5"><input type="checkbox" checked={lastNameFirst} onChange={(e) => setLastNameFirst(e.target.checked)} /> Příjmení je uvedeno první</label>}
            {!mapping.className && <Field label="Třída pro všechny řádky (soubor ji neobsahuje)"><input className="input" placeholder="např. 6.A" value={defaultClass} onChange={(e) => setDefaultClass(e.target.value)} /></Field>}
            {mapping.citizenship && <label className="text-sm flex items-center gap-2 pt-5"><input type="checkbox" checked={tagForeign} onChange={(e) => setTagForeign(e.target.checked)} /> Žákům s jiným než českým občanstvím přidat štítek OMJ</label>}
            {mapping.group && (
              <>
                <Field label="Předmět skupin"><select className="input" value={subjectId ?? subjects[0]?.id ?? ''} onChange={(e) => setSubjectId(Number(e.target.value))}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Skupiny tvořit">
                  <select className="input" value={groupScope} onChange={(e) => setGroupScope(e.target.value as 'grade' | 'class')}>
                    <option value="class">v rámci třídy (6.A sk. 1, 6.B sk. 1…)</option>
                    <option value="grade">v rámci ročníku (6. r. sk. 1 napříč třídami)</option>
                  </select>
                </Field>
              </>
            )}
          </div>
          <div className="card overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold">Náhled ({rows.length} žáků)</div>
            <table className="table">
              <thead><tr><th>Třída</th><th>Roč.</th><th>Příjmení</th><th>Jméno</th><th>Skupina</th><th>Narozen/a</th><th>Občanství</th><th>#</th></tr></thead>
              <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i}><td>{r.className || defaultClass}</td><td>{r.gradeLevel ?? ''}</td><td>{r.lastName}</td><td>{r.firstName}</td><td>{r.group}</td><td>{fmtDate(r.birthDate)}</td><td>{r.citizenship}</td><td>{r.catalogNumber}</td></tr>)}</tbody>
            </table>
            <div className="p-3 flex items-center justify-between border-t border-slate-200">
              <span className="text-sm text-green-700">{result}</span>
              <div className="flex gap-2">
                {result && <button className="btn-secondary" onClick={() => navigate('/tridy')}>Přejít na třídy</button>}
                <button className="btn-primary" disabled={busy || rows.length === 0 || !!result} onClick={doImport}>Importovat {rows.length} žáků</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function WordImport() {
  const navigate = useNavigate()
  const subjects = useSubjects()
  const groups = useGroups()
  const [items, setItems] = useState<ExtractedItem[]>([])
  const [rawText, setRawText] = useState('')
  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState<number | undefined>(undefined)
  const [gradeLevel, setGradeLevel] = useState<number | undefined>(undefined)
  const [groupId, setGroupId] = useState<number | undefined>(undefined)
  const [fileName, setFileName] = useState('')
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState('')

  const onFile = async (f: File) => {
    setError(''); setFileName(f.name); setTitle(f.name.replace(/\.[^.]+$/, ''))
    try {
      if (/\.docx$/i.test(f.name)) { const r = await extractDocx(f); setItems(r.items); setRawText(r.rawText) }
      else if (/\.(txt|md)$/i.test(f.name)) { const t = await f.text(); setItems(extractPlainText(t)); setRawText(t) }
      else setError('Podporovány jsou soubory .docx (Word) a .txt. Starý formát .doc uložte ve Wordu jako .docx.')
      const m = f.name.match(/(\d)\.?\s*(ro[cč]|r\b|tr)/i); if (m) setGradeLevel(Number(m[1]))
    } catch (e) { setError(`Soubor se nepodařilo přečíst: ${(e as Error).message}`) }
  }
  const update = (i: number, patch: Partial<ExtractedItem>) => setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const remove = (i: number) => setItems(items.filter((_, idx) => idx !== i))
  const create = async () => {
    if (!title.trim() || items.length === 0) return
    const planId = await db.plans.add({ title: title.trim(), subjectId: subjectId ?? subjects[0]?.id, gradeLevel, groupId, sourceFileName: fileName || undefined, createdAt: new Date().toISOString() })
    await db.planItems.bulkAdd(items.map((it, i) => ({ planId, order: i, text: it.text, level: it.level, month: it.month, hours: it.hours, done: false })))
    navigate(`/plany/${planId}`)
  }

  return (
    <div className="space-y-4">
      <div className="card card-body">
        <p className="text-sm text-slate-600 mb-3">Nahrajte tematický plán ve formátu <b>.docx</b>. Aplikace z dokumentu vytáhne nadpisy, odstavce, odrážky i řádky tabulek, pozná měsíce a hodinové dotace. Před uložením si položky můžete upravit, sloučit nebo smazat.</p>
        <div className="flex flex-wrap items-center gap-4">
          <input type="file" accept=".docx,.txt,.md" className="text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <span className="text-xs text-slate-400">nebo vložte text:</span>
        </div>
        <div className="mt-2 flex gap-2">
          <textarea className="input" rows={3} placeholder="Každý řádek = jedno téma…" value={pasted} onChange={(e) => setPasted(e.target.value)} />
          <button className="btn-secondary" onClick={() => { setItems(extractPlainText(pasted)); setRawText(pasted); if (!title) setTitle('Tematický plán') }}>Načíst text</button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
      {items.length > 0 && (
        <>
          <div className="card card-body grid gap-3 md:grid-cols-4">
            <Field label="Název plánu"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Předmět"><select className="input" value={subjectId ?? subjects[0]?.id ?? ''} onChange={(e) => setSubjectId(Number(e.target.value))}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Ročník"><input type="number" min={1} max={9} className="input" value={gradeLevel ?? ''} onChange={(e) => setGradeLevel(Number(e.target.value) || undefined)} /></Field>
            <Field label="Jen pro skupinu"><select className="input" value={groupId ?? ''} onChange={(e) => setGroupId(Number(e.target.value) || undefined)}><option value="">— všechny —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          </div>
          <div className="card">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold flex justify-between"><span>Rozpoznané položky ({items.length})</span><span className="text-xs font-normal text-slate-400">N = nadpis celku, T = téma k odškrtnutí</span></div>
            <ul className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {items.map((it, i) => (
                <li key={i} className={`flex items-center gap-2 px-3 py-1 ${it.level === 0 ? 'bg-slate-50' : ''}`}>
                  <button className={`btn-sm rounded border w-7 ${it.level === 0 ? 'bg-slate-700 text-white' : 'bg-white'}`} onClick={() => update(i, { level: it.level === 0 ? 1 : 0 })}>{it.level === 0 ? 'N' : 'T'}</button>
                  <input className={`input flex-1 ${it.level === 0 ? 'font-semibold' : ''}`} value={it.text} onChange={(e) => update(i, { text: e.target.value })} />
                  <input className="input w-24 text-xs" placeholder="měsíc" value={it.month ?? ''} onChange={(e) => update(i, { month: e.target.value || undefined })} />
                  <input className="input w-14 text-xs" placeholder="h" value={it.hours ?? ''} onChange={(e) => update(i, { hours: Number(e.target.value) || undefined })} />
                  <button className="btn-ghost btn-sm text-red-600" onClick={() => remove(i)}>×</button>
                </li>
              ))}
            </ul>
            <div className="p-3 flex justify-end gap-2 border-t border-slate-200">
              <button className="btn-primary" onClick={create} disabled={!title.trim()}>Vytvořit plán s {items.filter((i) => i.level > 0).length} tématy</button>
            </div>
          </div>
          {rawText && <details className="card card-body text-xs text-slate-500"><summary className="cursor-pointer">Zobrazit celý text dokumentu</summary><pre className="whitespace-pre-wrap mt-2">{rawText}</pre></details>}
        </>
      )}
    </div>
  )
}

/** Import známek z tabulky: řádek = žák, sloupce = jednotlivá hodnocení. */
function GradesImport() {
  const navigate = useNavigate()
  const subjects = useSubjects()
  const groups = useGroups()
  const students = useStudents()
  const categories = useCategories()
  const [sheets, setSheets] = useState<ParsedSheet[]>([])
  const [sheetIdx, setSheetIdx] = useState(0)
  const [nameCols, setNameCols] = useState<{ lastName?: string; firstName?: string; fullName?: string }>({})
  const [subjectId, setSubjectId] = useState<number | undefined>()
  const [groupId, setGroupId] = useState<number | undefined>()
  const [cols, setCols] = useState<Record<string, { use: boolean; categoryId: number; date: string; maxPoints?: number }>>({})
  const [result, setResult] = useState('')
  const sheet = sheets[sheetIdx]
  const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

  const onFile = async (f: File) => {
    const parsed = await parseWorkbook(f)
    setSheets(parsed); setSheetIdx(0); setResult('')
    init(parsed[0])
  }
  const init = (sh?: ParsedSheet) => {
    if (!sh) return
    const m = guessMapping(sh.headers)
    setNameCols({ lastName: m.lastName, firstName: m.firstName, fullName: m.fullName })
    const used = new Set([m.lastName, m.firstName, m.fullName, m.className, m.group, m.catalogNumber, m.gradeLevel, m.birthDate, m.citizenship].filter(Boolean))
    const next: typeof cols = {}
    for (const h of sh.headers) {
      if (used.has(h)) continue
      const values = sh.rows.map((r) => String(r[h] ?? '').trim()).filter(Boolean)
      if (!values.length) continue
      const nums = values.map(Number).filter((n) => !isNaN(n))
      const looksLikeGrades = nums.length === values.filter((v) => v.toUpperCase() !== 'N').length && nums.every((n) => n >= 1 && n <= 5 && Number.isInteger(n))
      const maxGuess = (h.match(/\/\s*(\d+)/) ?? [])[1]
      next[h] = { use: nums.length > 0, categoryId: categories[1]?.id ?? categories[0]?.id, date: todayISO(), maxPoints: looksLikeGrades ? undefined : maxGuess ? Number(maxGuess) : Math.max(...nums) || undefined }
    }
    setCols(next)
  }
  const roster = groupId ? students.filter((s) => groups.find((g) => g.id === groupId)?.studentIds.includes(s.id)) : students
  const matchStudent = (row: Record<string, unknown>) => {
    let last = nameCols.lastName ? String(row[nameCols.lastName] ?? '') : ''
    let first = nameCols.firstName ? String(row[nameCols.firstName] ?? '') : ''
    if (nameCols.fullName && !(last && first)) { const sp = splitFullName(String(row[nameCols.fullName] ?? '')); last ||= sp.lastName; first ||= sp.firstName }
    if (!last) return undefined
    return roster.find((s) => fold(s.lastName) === fold(last) && (!first || fold(s.firstName) === fold(first)))
      ?? roster.find((s) => fold(s.lastName) === fold(first) && fold(s.firstName) === fold(last))
  }
  const rows = sheet ? sheet.rows.map((r) => ({ r, student: matchStudent(r) })) : []
  const active = Object.entries(cols).filter(([, c]) => c.use)

  const doImport = async () => {
    const subj = subjectId ?? subjects[0]?.id
    if (!subj) return
    let n = 0
    for (const { r, student } of rows) {
      if (!student) continue
      for (const [h, c] of active) {
        const raw = String(r[h] ?? '').trim()
        if (!raw) continue
        const cat = categories.find((x) => x.id === c.categoryId)
        const base = { studentId: student.id, subjectId: subj, groupId, categoryId: c.categoryId, date: c.date, title: h, weight: cat?.weight ?? 1 }
        if (raw.toUpperCase() === 'N') await db.assessments.add({ ...base, absent: true })
        else if (c.maxPoints) await db.assessments.add({ ...base, points: Number(raw.replace(',', '.')), maxPoints: c.maxPoints })
        else { const g = Number(raw); if (g >= 1 && g <= 5) await db.assessments.add({ ...base, grade: Math.round(g) }) }
        n++
      }
    }
    setResult(`Naimportováno ${n} známek pro ${rows.filter((x) => x.student).length} žáků.`)
  }

  return (
    <div className="space-y-4">
      <div className="card card-body">
        <p className="text-sm text-slate-600 mb-3">Tabulka: v každém řádku žák (příjmení a jméno), v dalších sloupcích jednotlivá hodnocení. Hodnota 1–5 = známka, jiné číslo = body (zadejte max. bodů), „N“ = nehodnocen. Nejdřív vyberte předmět a skupinu, aby se žáci správně spárovali.</p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Předmět"><select className="input w-auto" value={subjectId ?? subjects[0]?.id ?? ''} onChange={(e) => setSubjectId(Number(e.target.value))}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Skupina"><select className="input w-auto" value={groupId ?? ''} onChange={(e) => setGroupId(Number(e.target.value) || undefined)}><option value="">všichni žáci</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
          <input type="file" accept=".xlsx,.xls,.csv,.ods" className="text-sm" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </div>
      </div>
      {sheet && (
        <>
          <div className="card card-body grid gap-3 md:grid-cols-4">
            {sheets.length > 1 && <Field label="List"><select className="input" value={sheetIdx} onChange={(e) => { setSheetIdx(Number(e.target.value)); init(sheets[Number(e.target.value)]) }}>{sheets.map((s, i) => <option key={s.sheetName} value={i}>{s.sheetName}</option>)}</select></Field>}
            {([['lastName', 'Příjmení'], ['firstName', 'Jméno'], ['fullName', 'Celé jméno']] as const).map(([k, l]) => (
              <Field key={k} label={l}><select className="input" value={nameCols[k] ?? ''} onChange={(e) => setNameCols({ ...nameCols, [k]: e.target.value || undefined })}><option value="">—</option>{sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></Field>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold">Sloupce s hodnocením</div>
            <table className="table">
              <thead><tr><th>Použít</th><th>Sloupec (název hodnocení)</th><th>Kategorie</th><th>Datum</th><th>Max. bodů (prázdné = známka 1–5)</th></tr></thead>
              <tbody>{Object.entries(cols).map(([h, c]) => (
                <tr key={h}>
                  <td><input type="checkbox" checked={c.use} onChange={(e) => setCols({ ...cols, [h]: { ...c, use: e.target.checked } })} /></td>
                  <td className="font-medium">{h}</td>
                  <td><select className="input" value={c.categoryId} onChange={(e) => setCols({ ...cols, [h]: { ...c, categoryId: Number(e.target.value) } })}>{categories.map((x) => <option key={x.id} value={x.id}>{x.name} (v{x.weight})</option>)}</select></td>
                  <td><input type="date" className="input" value={c.date} onChange={(e) => setCols({ ...cols, [h]: { ...c, date: e.target.value } })} /></td>
                  <td><input type="number" className="input w-24" value={c.maxPoints ?? ''} onChange={(e) => setCols({ ...cols, [h]: { ...c, maxPoints: Number(e.target.value) || undefined } })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="card overflow-x-auto">
            <div className="px-4 py-2 border-b border-slate-200 text-sm font-semibold">Spárování žáků: {rows.filter((x) => x.student).length} z {rows.length}</div>
            <table className="table">
              <thead><tr><th>Řádek v tabulce</th><th>Žák v aplikaci</th>{active.map(([h]) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{rows.slice(0, 100).map(({ r, student }, i) => (
                <tr key={i} className={student ? '' : 'bg-red-50'}>
                  <td>{[nameCols.lastName, nameCols.firstName, nameCols.fullName].filter(Boolean).map((k) => String(r[k!] ?? '')).join(' ')}</td>
                  <td>{student ? fullName(student) : <span className="text-red-600">nenalezen – přeskočí se</span>}</td>
                  {active.map(([h]) => <td key={h}>{String(r[h] ?? '')}</td>)}
                </tr>
              ))}</tbody>
            </table>
            <div className="p-3 flex items-center justify-between border-t border-slate-200">
              <span className="text-sm text-green-700">{result}</span>
              <div className="flex gap-2">
                {result && <button className="btn-secondary" onClick={() => navigate(`/hodnoceni?subjectId=${subjectId ?? subjects[0]?.id}${groupId ? `&groupId=${groupId}` : ''}`)}>Otevřít hodnocení</button>}
                <button className="btn-primary" disabled={!!result || !active.length || !rows.some((x) => x.student)} onClick={doImport}>Importovat známky</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
