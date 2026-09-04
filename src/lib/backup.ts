import { db, ALL_TABLES, type TableName } from '../db/schema'

const blobToBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] ?? ''); r.onerror = rej; r.readAsDataURL(b) })
const base64ToBlob = (s: string, type: string) => { const bin = atob(s); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type }) }

export async function exportBackup(): Promise<Blob> {
  const data: Record<string, unknown[]> = {}
  for (const t of ALL_TABLES) {
    const rows = await db.table(t).toArray()
    // soubory (šablona výkazu) uložíme jako base64
    data[t] = t === 'documents' ? await Promise.all(rows.map(async (r) => ({ ...r, blob: undefined, blobBase64: await blobToBase64(r.blob), blobType: r.blob.type }))) : rows
  }
  const payload = { app: 'pedagogicky-denik', version: 1, exportedAt: new Date().toISOString(), data }
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
}

export async function importBackup(file: File, mode: 'replace' | 'merge' = 'replace') {
  const text = await file.text()
  const payload = JSON.parse(text) as { app?: string; data?: Record<string, unknown[]> }
  if (payload.app !== 'pedagogicky-denik' || !payload.data) throw new Error('Soubor není záloha Pedagogického deníku.')
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
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
