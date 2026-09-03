import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Upload } from 'lucide-react'
import { db } from '../db/schema'
import { importPlansFile, readJsonFile, type PlansFile } from '../db/seed'
import { FileJson } from 'lucide-react'
import { useGroups, useSubjects } from '../components/hooks'
import { ConfirmButton, EmptyState, Field, Modal, PageHeader } from '../components/ui'

export function PlansPage() {
  const plans = useLiveQuery(() => db.plans.toArray(), []) ?? []
  const items = useLiveQuery(() => db.planItems.toArray(), []) ?? []
  const subjects = useSubjects()
  const groups = useGroups()
  const [presetMsg, setPresetMsg] = useState('')
  const [draft, setDraft] = useState<{ title: string; subjectId?: number; gradeLevel?: number; groupId?: number } | null>(null)
  const save = async () => {
    if (!draft?.title.trim()) return
    await db.plans.add({ ...draft, title: draft.title.trim(), createdAt: new Date().toISOString() })
    setDraft(null)
  }
  return (
    <div>
      <PageHeader title="Tematické plány" subtitle="Odškrtávejte probraná témata" actions={
        <>
          <label className="btn-secondary"><FileJson size={16} /> Nahrát plány ze souboru (JSON)
            <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const n = await importPlansFile(await readJsonFile<PlansFile>(f)); setPresetMsg(n ? `Nahráno ${n} plánů.` : 'Všechny plány ze souboru už existují.') } catch (err) { setPresetMsg((err as Error).message) } e.target.value = '' }} />
          </label>
          <Link to="/import?tab=word" className="btn-secondary"><Upload size={16} /> Nahrát z Wordu</Link>
          <button className="btn-primary" onClick={() => setDraft({ title: '', subjectId: subjects[0]?.id })}><Plus size={16} /> Nový plán ručně</button>
        </>
      } />
      {presetMsg && <p className="mb-3 text-sm text-green-700">{presetMsg}</p>}
      {plans.length === 0 && <EmptyState>Zatím žádný tematický plán. Nahrajte Word dokument nebo založte plán ručně.</EmptyState>}
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((p) => {
          const mine = items.filter((i) => i.planId === p.id && i.level > 0)
          const done = mine.filter((i) => i.done).length
          const pct = mine.length ? Math.round((done / mine.length) * 100) : 0
          const next = items.filter((i) => i.planId === p.id && i.level > 0 && !i.done).sort((a, b) => a.order - b.order)[0]
          return (
            <div key={p.id} className="card card-body">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link to={`/plany/${p.id}`} className="font-semibold text-blue-700 hover:underline">{p.title}</Link>
                  <div className="text-xs text-slate-500">{subjects.find((s) => s.id === p.subjectId)?.name ?? ''}{p.gradeLevel ? ` · ${p.gradeLevel}. ročník` : ''}{p.groupId ? ` · ${groups.find((g) => g.id === p.groupId)?.name}` : ''}{p.sourceFileName ? ` · ${p.sourceFileName}` : ''}</div>
                </div>
                <ConfirmButton onConfirm={async () => { await db.planItems.where('planId').equals(p.id).delete(); await db.plans.delete(p.id) }}>Smazat</ConfirmButton>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm"><div className="flex-1 h-2 rounded bg-slate-200"><div className="h-2 rounded bg-green-500" style={{ width: `${pct}%` }} /></div><span className="text-slate-600">{done}/{mine.length} ({pct} %)</span></div>
              {next && <div className="mt-2 text-xs text-slate-500">Další téma: <span className="text-slate-800">{next.text}</span></div>}
            </div>
          )
        })}
      </div>
      <Modal open={!!draft} onClose={() => setDraft(null)} title="Nový tematický plán">
        {draft && (
          <div className="space-y-3">
            <Field label="Název"><input className="input" autoFocus value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Předmět"><select className="input" value={draft.subjectId ?? ''} onChange={(e) => setDraft({ ...draft, subjectId: Number(e.target.value) || undefined })}><option value="">—</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
              <Field label="Ročník"><input type="number" min={1} max={9} className="input" value={draft.gradeLevel ?? ''} onChange={(e) => setDraft({ ...draft, gradeLevel: Number(e.target.value) || undefined })} /></Field>
              <Field label="Jen pro skupinu"><select className="input" value={draft.groupId ?? ''} onChange={(e) => setDraft({ ...draft, groupId: Number(e.target.value) || undefined })}><option value="">— všechny —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
            </div>
            <div className="flex justify-end gap-2"><button className="btn-secondary" onClick={() => setDraft(null)}>Zrušit</button><button className="btn-primary" onClick={save}>Založit</button></div>
          </div>
        )}
      </Modal>
    </div>
  )
}
