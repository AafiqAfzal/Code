import { db, ALL_TABLES, type TableName } from '../db/schema'

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {}
  for (const t of ALL_TABLES) data[t] = await db.table(t).toArray()
  const payload = { app: 'pedagogicky-denik', version: 1, exportedAt: new Date().toISOString(), data }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function importBackup(file: File, mode: 'replace' | 'merge' = 'replace') {
  const text = await file.text()
  const payload = JSON.parse(text) as { app?: string; data?: Record<string, unknown[]> }
  if (payload.app !== 'pedagogicky-denik' || !payload.data) throw new Error('Soubor není záloha Pedagogického deníku.')
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      const rows = payload.data![t as TableName] ?? []
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
