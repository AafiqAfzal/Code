import { db, ALL_TABLES, type TableName } from '../db/schema'

const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b) })
const base64ToBlob = (s: string, type: string) => { const bin = atob(s); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type }) }

export async function exportBackup(): Promise<Blob> {
  // všechny tabulky v jedné čtecí transakci = konzistentní snímek (i když se zrovna něco zapisuje)
  const raw: Record<string, unknown[]> = {}
  await db.transaction('r', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) raw[t] = await db.table(t).toArray()
  })
  // soubory (šablona výkazu) uložíme jako base64 – až mimo transakci (FileReader není součást Dexie)
  const data: Record<string, unknown[]> = { ...raw }
  data.documents = await Promise.all((raw.documents as { blob: Blob }[]).map(async (r) => ({ ...r, blob: undefined, blobBase64: await blobToBase64(r.blob), blobType: r.blob.type })))
  const payload = { app: 'pedagogicky-denik', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

const BACKUP_VERSION = 1
/** Tabulky s výchozím obsahem (nastavení, předměty, kategorie, škála) – samy o sobě nejsou „data“. */
const DEFAULT_TABLES: readonly string[] = ['settings', 'subjects', 'gradeCategories', 'gradingScales']
/** Tabulky s daty učitele: žáci, známky, zápisy, výkaz, poznámky… */
const CONTENT_TABLES = ALL_TABLES.filter((t) => !DEFAULT_TABLES.includes(t))

/** Je v databázi něco, co stojí za zálohu? (cokoli kromě výchozího nastavení) */
export async function hasUserData(): Promise<boolean> {
  const counts = await Promise.all(CONTENT_TABLES.map((t) => db.table(t).count()))
  return counts.some((n) => n > 0)
}

/** Počet žáků a záznamů v záloze (text JSON) – kvůli rozpoznání prázdné zálohy. */
export function backupSummary(text: string): { students: number; records: number; exportedAt?: string } {
  try {
    const p = JSON.parse(text) as { exportedAt?: string; data?: Record<string, unknown[]> }
    const data = p.data ?? {}
    return { students: data.students?.length ?? 0, records: CONTENT_TABLES.reduce((n, t) => n + (Array.isArray(data[t]) ? data[t].length : 0), 0), exportedAt: p.exportedAt }
  } catch {
    return { students: 0, records: 0 }
  }
}

/** Kontrola zálohy před obnovou – raději odmítnout, než smazat data nesmyslným souborem. */
function validateBackup(payload: { app?: string; version?: number; data?: Record<string, unknown> }) {
  if (payload.app !== 'pedagogicky-denik' || !payload.data || typeof payload.data !== 'object') throw new Error('Soubor není záloha Pedagogického deníku.')
  if ((payload.version ?? 1) > BACKUP_VERSION) throw new Error('Záloha je z novější verze aplikace. Nejdřív aplikaci aktualizujte.')
  const d = payload.data
  if (!Array.isArray(d.settings) || !Array.isArray(d.students)) throw new Error('Záloha je neúplná (chybí nastavení nebo seznam žáků).')
  for (const t of ALL_TABLES) {
    const rows = d[t]
    if (rows === undefined) continue
    if (!Array.isArray(rows)) throw new Error(`Záloha je poškozená (tabulka ${t}).`)
    for (const r of rows) if (!r || typeof r !== 'object' || (r as { id?: unknown }).id == null) throw new Error(`Záloha je poškozená (záznam bez id v tabulce ${t}).`)
  }
}

export async function importBackup(file: File, mode: 'replace' | 'merge' = 'replace') {
  const text = await file.text()
  let payload: { app?: string; version?: number; data?: Record<string, unknown[]> }
  try { payload = JSON.parse(text) } catch { throw new Error('Soubor nejde přečíst – není to platná záloha (JSON).') }
  validateBackup(payload)
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      // tabulka, kterou starší záloha ještě neznala, zůstane beze změny (nesmaže se)
      if (payload.data![t as TableName] === undefined) continue
      let rows = payload.data![t as TableName] ?? []
      if (t === 'documents') rows = (rows as { blobBase64?: string; blobType?: string }[]).filter((r) => r.blobBase64).map(({ blobBase64, blobType, ...r }) => ({ ...r, blob: base64ToBlob(blobBase64!, blobType ?? '') }))
      if (mode === 'replace') await db.table(t).clear()
      await db.table(t).bulkPut(rows)
    }
  })
}

export async function wipeAll() {
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear()
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
