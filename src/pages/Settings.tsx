import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { db, type GradeCategory, type Settings, type Subject } from '../db/schema'
import { DEFAULT_CATEGORIES, loadDemoData } from '../db/seed'
import { useCategories, useScale, useSettings, useSubjects } from '../components/hooks'
import { ConfirmButton, Field, PageHeader, Toast, useToast } from '../components/ui'
import { downloadBlob, exportBackup, importBackup, wipeAll } from '../lib/backup'
import { isDesktop, runDailyAutoBackupForce, saveBackupAs } from '../lib/desktop'
import { PIN_RE, clearPin, setPin, verifyPin } from '../lib/pin'
import { NewYearWizard } from '../components/NewYearWizard'
import { NATIONAL_SCHOOL_HOLIDAYS } from '../lib/holidays'
import { fmtDate } from '../lib/format'

export function SettingsPage() {
  const settings = useSettings()
  const subjects = useSubjects()
  const categories = useCategories()
  const scale = useScale()
  const { message, show } = useToast()
  const [backupDir, setBackupDir] = useState('')
  const [pinNew, setPinNew] = useState('')
  const [pinOld, setPinOld] = useState('')
  const [lockMin, setLockMin] = useState<number | null>(null)
  const [wizard, setWizard] = useState(false)
  const [version, setVersion] = useState('')
  const [update, setUpdate] = useState<UpdateState | null>(null)
  useEffect(() => {
    window.denik?.backupDir().then(setBackupDir)
    window.denik?.version().then(setVersion)
    window.denik?.updateState().then(setUpdate)
    return window.denik?.onUpdateState(setUpdate)
  }, [])
  const updateLabel = (u: UpdateState | null) => {
    if (!u) return ''
    switch (u.status) {
      case 'checking': return 'Kontroluji aktualizace…'
      case 'downloading': return `Stahuji verzi ${u.version}…`
      case 'up-to-date': return 'Máte nejnovější verzi.'
      case 'ready': return `Verze ${u.version} je stažena – nainstaluje se po restartu aplikace.`
      case 'error': return `Aktualizaci se nepodařilo zkontrolovat (${u.error}).`
      case 'dev': return 'Aktualizace fungují jen v nainstalované verzi.'
      default: return ''
    }
  }
  const holidays = useLiveQuery(() => db.schoolHolidays.orderBy('from').toArray(), []) ?? []
  const [hol, setHol] = useState({ name: 'Jarní prázdniny', from: '', to: '' })
  const counts = useLiveQuery(async () => ({ students: await db.students.count(), assessments: await db.assessments.count() }), [])

  const upd = (patch: Partial<Settings>) => db.settings.update(1, patch)
  const updCat = (c: GradeCategory, patch: Partial<GradeCategory>) => db.gradeCategories.update(c.id, patch)
  const updSubj = (s: Subject, patch: Partial<Subject>) => db.subjects.update(s.id, patch)

  return (
    <div className="space-y-4">
      <PageHeader title="Nastavení" />
      <Toast message={message} />
      {settings && (
        <section className="card card-body grid gap-3 md:grid-cols-3">
          <h2 className="card-title md:col-span-3">Učitel a školní rok</h2>
          <Field label="Jméno učitele"><input className="input" defaultValue={settings.teacherName} onBlur={(e) => upd({ teacherName: e.target.value })} /></Field>
          <Field label="Škola"><input className="input" defaultValue={settings.schoolName} onBlur={(e) => upd({ schoolName: e.target.value })} /></Field>
          <Field label="Školní rok"><input className="input" defaultValue={settings.schoolYear} onBlur={(e) => upd({ schoolYear: e.target.value })} /></Field>
          <Field label="Začátek roku"><input type="date" className="input" defaultValue={settings.yearStart} onBlur={(e) => upd({ yearStart: e.target.value })} /></Field>
          <Field label="Konec roku"><input type="date" className="input" defaultValue={settings.yearEnd} onBlur={(e) => upd({ yearEnd: e.target.value })} /></Field>
          <Field label="Odkaz na Školu online"><input className="input" defaultValue={settings.skolaOnlineUrl} onBlur={(e) => upd({ skolaOnlineUrl: e.target.value })} /></Field>
          <Field label="Výchozí předmět" className="md:col-span-3">
            <select className="input w-auto" value={settings.defaultSubjectId ?? ''} onChange={(e) => upd({ defaultSubjectId: Number(e.target.value) || undefined })}>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </Field>
        </section>
      )}

      <section className="card card-body">
        <div className="flex items-center justify-between mb-2"><h2 className="card-title">Předměty</h2><button className="btn-secondary btn-sm" onClick={() => db.subjects.add({ name: 'Nový předmět', abbreviation: 'NP', color: '#64748b' })}><Plus size={14} /> Přidat</button></div>
        <table className="table"><thead><tr><th>Název</th><th>Zkratka</th><th>Barva</th><th></th></tr></thead>
          <tbody>{subjects.map((s) => (
            <tr key={s.id}>
              <td><input className="input" defaultValue={s.name} onBlur={(e) => updSubj(s, { name: e.target.value })} /></td>
              <td><input className="input w-20" defaultValue={s.abbreviation} onBlur={(e) => updSubj(s, { abbreviation: e.target.value })} /></td>
              <td><input type="color" defaultValue={s.color} onChange={(e) => updSubj(s, { color: e.target.value })} /></td>
              <td className="text-right"><ConfirmButton onConfirm={() => db.subjects.delete(s.id)}>Smazat</ConfirmButton></td>
            </tr>
          ))}</tbody></table>
      </section>

      <section className="card card-body">
        <div className="flex items-center justify-between mb-2">
          <div><h2 className="card-title">Hodnocení – {scale.name || 'Průběžné hodnocení 2026-27'}</h2><p className="text-xs text-slate-500">Kategorie s váhami a převod procent na známku. Upravte podle dokumentu Průběžné hodnocení 2026-27.</p></div>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => db.gradeCategories.add({ name: 'Nová kategorie', weight: 1, color: '#64748b', order: (categories.at(-1)?.order ?? 0) + 1 })}><Plus size={14} /> Kategorie</button>
            <ConfirmButton className="btn-secondary btn-sm" confirmLabel="Obnovit výchozí?" onConfirm={async () => { await db.gradeCategories.clear(); await db.gradeCategories.bulkAdd(DEFAULT_CATEGORIES) }}>Výchozí kategorie</ConfirmButton>
          </div>
        </div>
        <table className="table mb-4"><thead><tr><th>Kategorie</th><th>Váha</th><th>Barva</th><th>Pořadí</th><th></th></tr></thead>
          <tbody>{categories.map((c) => (
            <tr key={c.id}>
              <td><input className="input" defaultValue={c.name} onBlur={(e) => updCat(c, { name: e.target.value })} /></td>
              <td><input type="number" step="0.5" min={0} className="input w-20" defaultValue={c.weight} onBlur={(e) => updCat(c, { weight: Number(e.target.value) })} /></td>
              <td><input type="color" defaultValue={c.color} onChange={(e) => updCat(c, { color: e.target.value })} /></td>
              <td><input type="number" className="input w-16" defaultValue={c.order} onBlur={(e) => updCat(c, { order: Number(e.target.value) })} /></td>
              <td className="text-right"><ConfirmButton onConfirm={() => db.gradeCategories.delete(c.id)}>Smazat</ConfirmButton></td>
            </tr>
          ))}</tbody></table>
        <div className="grid gap-3 md:grid-cols-5">
          <Field label="Název škály"><input className="input" defaultValue={scale.name} onBlur={(e) => db.gradingScales.update(1, { name: e.target.value })} /></Field>
          {[1, 2, 3, 4].map((g, i) => (
            <Field key={g} label={`Známka ${g} od (%)`}>
              <input type="number" min={0} max={100} className="input" defaultValue={scale.thresholds[i]} onBlur={(e) => { const t = [...scale.thresholds] as [number, number, number, number]; t[i] = Number(e.target.value); db.gradingScales.update(1, { thresholds: t }) }} />
            </Field>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-1">Známka 5 = méně než {scale.thresholds[3]} %.</p>
        <Field label="Text pravidel hodnocení (zobrazí se jako připomínka)" className="mt-3">
          <textarea className="input font-mono text-xs" rows={8} defaultValue={scale.rulesText} onBlur={(e) => db.gradingScales.update(1, { rulesText: e.target.value })} />
        </Field>
      </section>

      <section className="card card-body">
        <div className="flex items-center justify-between mb-1">
          <h2 className="card-title">Školní prázdniny</h2>
          {NATIONAL_SCHOOL_HOLIDAYS[settings?.schoolYear ?? ''] && (
            <button className="btn-secondary btn-sm" onClick={async () => {
              const preset = NATIONAL_SCHOOL_HOLIDAYS[settings!.schoolYear]
              const existing = new Set(holidays.map((h) => `${h.name}|${h.from}`))
              const add = preset.filter((p) => !existing.has(`${p.name}|${p.from}`))
              await db.schoolHolidays.bulkAdd(add); show(add.length ? `Přidáno ${add.length} termínů.` : 'Termíny už jsou vložené.')
            }}>Načíst celostátní termíny {settings?.schoolYear} (MŠMT)</button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-3">Celostátní prázdniny jsou pro všechny školy stejné. <b>Jarní prázdniny</b> se liší podle okresu, zadejte je ručně. Prázdniny se zobrazují v kalendáři, v rozvrhu a na přehledu.</p>
        {holidays.length > 0 && (
          <table className="table mb-3"><thead><tr><th>Název</th><th>Od</th><th>Do</th><th></th></tr></thead>
            <tbody>{holidays.map((h) => (
              <tr key={h.id}><td>{h.name}</td><td>{fmtDate(h.from)}</td><td>{fmtDate(h.to)}</td><td className="text-right"><ConfirmButton onConfirm={() => db.schoolHolidays.delete(h.id)}>Smazat</ConfirmButton></td></tr>
            ))}</tbody></table>
        )}
        <div className="grid gap-3 md:grid-cols-4 items-end">
          <Field label="Název"><input className="input" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} /></Field>
          <Field label="Od"><input type="date" className="input" value={hol.from} onChange={(e) => setHol({ ...hol, from: e.target.value, to: hol.to || e.target.value })} /></Field>
          <Field label="Do"><input type="date" className="input" value={hol.to} onChange={(e) => setHol({ ...hol, to: e.target.value })} /></Field>
          <button className="btn-primary btn-sm" disabled={!hol.name.trim() || !hol.from || !hol.to || hol.to < hol.from} onClick={async () => { await db.schoolHolidays.add({ name: hol.name.trim(), from: hol.from, to: hol.to }); setHol({ name: 'Jarní prázdniny', from: '', to: '' }); show('Prázdniny přidány.') }}>Přidat</button>
        </div>
      </section>

      <section className="card card-body">
        <h2 className="card-title mb-1">Zámek aplikace a připomínky</h2>
        <p className="text-xs text-slate-500 mb-3">PIN chrání před náhodným nahlédnutím na školním počítači. Nezašifruje data ani zálohy – kdo má přístup k souborům, PIN neomezí.</p>
        <div className="grid gap-3 md:grid-cols-4 items-end">
          {settings?.pinHash && <Field label="Současný PIN"><input type="password" inputMode="numeric" className="input" value={pinOld} onChange={(e) => setPinOld(e.target.value)} /></Field>}
          <Field label={settings?.pinHash ? 'Nový PIN (4–8 číslic)' : 'Nastavit PIN (4–8 číslic)'}><input type="password" inputMode="numeric" className="input" value={pinNew} onChange={(e) => setPinNew(e.target.value)} /></Field>
          <Field label="Zamknout po nečinnosti">
            <select className="input" value={lockMin ?? settings?.lockAfterMinutes ?? 15} onChange={(e) => { setLockMin(Number(e.target.value)); db.settings.update(1, { lockAfterMinutes: Number(e.target.value) }) }}>
              <option value={0}>jen při spuštění</option><option value={5}>5 minut</option><option value={15}>15 minut</option><option value={30}>30 minut</option><option value={60}>1 hodina</option>
            </select>
          </Field>
          <div className="flex gap-2">
            <button className="btn-primary btn-sm" disabled={!PIN_RE.test(pinNew)} onClick={async () => { if (settings?.pinHash && !(await verifyPin(pinOld))) { show('Současný PIN je nesprávný.'); return } await setPin(pinNew, lockMin ?? settings?.lockAfterMinutes ?? 15); setPinNew(''); setPinOld(''); show('PIN nastaven.') }}>{settings?.pinHash ? 'Změnit PIN' : 'Zapnout zámek'}</button>
            {settings?.pinHash && <ConfirmButton className="btn-secondary btn-sm" onConfirm={async () => { if (!(await verifyPin(pinOld))) { show('Zadejte současný PIN.'); return } await clearPin(); setPinOld(''); show('Zámek vypnut.') }}>Vypnout zámek</ConfirmButton>}
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm"><input type="checkbox" checked={settings?.remindersEnabled !== false} onChange={(e) => upd({ remindersEnabled: e.target.checked })} /> Připomínat události kalendáře (den předem a v den konání) systémovým oznámením a na přehledu</label>
      </section>

      <section className="card card-body">
        <h2 className="card-title mb-1">Nový školní rok</h2>
        <p className="text-xs text-slate-500 mb-2">Průvodce uloží zálohu, povýší třídy o ročník (VI.Z → VII.Z), vyřadí deváťáky, smaže letošní známky a zápisy a zruší odškrtnutí v tematických plánech. Spouštějte až v přípravném týdnu.</p>
        <button className="btn-secondary" onClick={() => setWizard(true)}>Spustit průvodce přechodem na nový školní rok</button>
        <NewYearWizard open={wizard} onClose={() => setWizard(false)} />
      </section>

      <section className="card card-body">
        <h2 className="card-title mb-1">Záloha dat</h2>
        <p className="text-xs text-slate-500 mb-3">Data jsou uložena pouze v tomto prohlížeči (žáků: {counts?.students ?? 0}, známek: {counts?.assessments ?? 0}). Pravidelně si stahujte zálohu – např. na konci týdne – a uložte ji na bezpečné místo. Zálohu lze nahrát v jiném prohlížeči či počítači.</p>
        {isDesktop() && (
          <div className="mb-3 rounded border border-green-200 bg-green-50 p-3 text-xs text-green-900">
            <b>Desktopová verze:</b> záloha se ukládá automaticky jednou denně při spuštění do složky <code>{backupDir}</code> (uchovává se posledních 30). Data aplikace jsou uložena v profilu aplikace na tomto počítači.
            <div className="mt-2 flex gap-2">
              <button className="btn-secondary btn-sm" onClick={async () => { const f = await runDailyAutoBackupForce(); show(f ? `Záloha uložena: ${f}` : 'Záloha selhala.') }}>Zálohovat teď</button>
              <button className="btn-secondary btn-sm" onClick={() => window.denik?.openBackupDir()}>Otevřít složku záloh</button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          <button className="btn-primary" onClick={async () => { if (isDesktop()) { const f = await saveBackupAs(); if (f) show(`Uloženo: ${f}`) } else { downloadBlob(await exportBackup(), `pedagogicky-denik-${new Date().toISOString().slice(0, 10)}.json`); show('Záloha stažena.') } }}>{isDesktop() ? 'Uložit zálohu jako…' : 'Stáhnout zálohu (JSON)'}</button>
          <label className="btn-secondary">Obnovit ze zálohy<input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (!confirm('Obnovení nahradí všechna současná data. Pokračovat?')) return; try { await importBackup(f, 'replace'); show('Data obnovena.') } catch (err) { alert((err as Error).message) } e.target.value = '' }} /></label>
          <button className="btn-secondary" onClick={async () => { await loadDemoData(); show('Ukázková data přidána.') }}>Přidat ukázková data</button>
          <ConfirmButton className="btn-danger" confirmLabel="Opravdu vše smazat?" onConfirm={async () => { await wipeAll(); location.reload() }}>Smazat všechna data</ConfirmButton>
        </div>
      </section>

      {isDesktop() && (
        <section className="card card-body text-sm text-slate-600">
          <h2 className="card-title mb-1">Aktualizace aplikace</h2>
          <p>Verze {version}. Aplikace při spuštění sama kontroluje nové verze na GitHubu a stáhne je; instalace proběhne po potvrzení nebo při ukončení aplikace. Data zůstávají zachována.</p>
          <div className="mt-2 flex items-center gap-3">
            <button className="btn-secondary btn-sm" onClick={async () => setUpdate(await window.denik!.checkForUpdates())}>Zkontrolovat aktualizace</button>
            <span className="text-xs">{updateLabel(update)}</span>
          </div>
        </section>
      )}
      <section className="card card-body text-sm text-slate-600">
        <h2 className="card-title mb-1">Škola online</h2>
        <p>Škola online nemá veřejné rozhraní pro učitele, proto aplikace pracuje přes soubory: <b>seznamy žáků</b> exportujte ze Školy online do Excelu a nahrajte v sekci Import dat; <b>známky</b> exportujte z Hodnocení do Excelu (list „Seznam známek“ je připraven pro přepis do Školy online). Odkaz v levém menu otevře Školu online v nové záložce.</p>
      </section>
    </div>
  )
}
