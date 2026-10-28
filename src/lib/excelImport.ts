import ExcelJS from 'exceljs/dist/exceljs.min.js'

export interface ImportRow {
  className?: string
  firstName?: string
  lastName?: string
  /** undefined = prázdná buňka (členství ve skupinách se nemění), '' = „-“ (výslovně bez skupiny) */
  group?: string
  catalogNumber?: number
  gradeLevel?: number
  birthDate?: string
  citizenship?: string
  gender?: 'M' | 'F'
  raw: Record<string, unknown>
}

export interface ColumnMapping {
  className?: string
  firstName?: string
  lastName?: string
  fullName?: string
  group?: string
  catalogNumber?: string
  gradeLevel?: string
  birthDate?: string
  citizenship?: string
  gender?: string
}

export interface ParsedSheet {
  sheetName: string
  headers: string[]
  rows: Record<string, unknown>[]
}

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

/** Heuristické rozpoznání sloupců (Škola online i běžné seznamy). */
export function guessMapping(headers: string[]): ColumnMapping {
  const m: ColumnMapping = {}
  for (const h of headers) {
    const n = norm(h)
    if (!m.className && (n === 'trida' || n.startsWith('trida') || n === 'class')) m.className = h
    else if (!m.firstName && (n === 'jmeno' || n === 'krestni jmeno' || n === 'first name' || n === 'firstname')) m.firstName = h
    else if (!m.lastName && (n === 'prijmeni' || n === 'last name' || n === 'lastname' || n === 'surname')) m.lastName = h
    else if (!m.fullName && (n === 'zak' || n === 'jmeno a prijmeni' || n === 'prijmeni a jmeno' || n === 'cele jmeno' || n === 'student' || n === 'name')) m.fullName = h
    else if (!m.group && (n.includes('skupin') || n === 'group' || n === 'sk' || n === 'sk.')) m.group = h
    else if (!m.catalogNumber && (n.includes('katalog') || n === 'c.' || n === 'cislo' || n === 'por. c.' || n === 'poradi' || n === 'c')) m.catalogNumber = h
    else if (!m.gradeLevel && n.startsWith('rocnik')) m.gradeLevel = h
    else if (!m.birthDate && (n.includes('narozen') || n === 'birth date' || n === 'birthdate')) m.birthDate = h
    else if (!m.citizenship && (n.includes('obcanstv') || n === 'citizenship' || n === 'narodnost')) m.citizenship = h
    else if (!m.gender && (n.startsWith('pohlav') || n === 'gender' || n === 'sex')) m.gender = h
  }
  return m
}

/** Hodnota buňky z ExcelJS → číslo, text nebo datum (vzorce → výsledek, formátovaný text → prostý text). */
function cellPlain(v: unknown): unknown {
  if (v == null) return ''
  if (v instanceof Date || typeof v !== 'object') return v
  const o = v as { richText?: { text: string }[]; result?: unknown; text?: unknown; error?: unknown }
  if (o.richText) return o.richText.map((r) => r.text).join('')
  if ('result' in o) return cellPlain(o.result)
  if (o.text != null) return cellPlain(o.text)
  return ''
}

/** Matice buněk → hlavička (první řádek s ≥ 2 neprázdnými buňkami) a řádky jako objekty. */
function matrixToSheet(sheetName: string, matrix: unknown[][]): ParsedSheet {
  let headerIdx = matrix.findIndex((r) => r.filter((c) => String(c).trim() !== '').length >= 2)
  if (headerIdx < 0) headerIdx = 0
  const headers = (matrix[headerIdx] ?? []).map((h, i) => (String(h).trim() ? String(h).trim() : `Sloupec ${i + 1}`))
  const rows: Record<string, unknown>[] = []
  for (const r of matrix.slice(headerIdx + 1)) {
    if (r.every((c) => String(c ?? '').trim() === '')) continue
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => (obj[h] = r[i] ?? ''))
    rows.push(obj)
  }
  return { sheetName, headers, rows }
}

/** CSV (oddělovač ; , nebo tabulátor, uvozovky) → matice. */
export function parseCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (ch: string) => first.split(ch).length - 1
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0]
  const out: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"' && cell === '') quoted = true
    else if (ch === sep) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); out.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out
}

/** Text souboru: UTF-8, případně Windows-1250 (CSV z českého Excelu). */
function decodeText(buf: ArrayBuffer): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, '') }
  catch { return new TextDecoder('windows-1250').decode(buf) }
}

/**
 * Načte sešit Excelu (.xlsx) nebo CSV. Starý formát .xls a .ods nečteme – knihovna,
 * která je uměla, má neopravené bezpečnostní chyby; stačí soubor v Excelu uložit jako .xlsx.
 */
export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer()
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.txt')) return [matrixToSheet(file.name, parseCsv(decodeText(buf)))]
  const head = new Uint8Array(buf.slice(0, 4))
  const isZip = head[0] === 0x50 && head[1] === 0x4b
  if (!isZip || name.endsWith('.ods')) throw new Error('Tento formát (.xls / .ods) neumím načíst. Otevřete soubor v Excelu a uložte ho jako „Sešit Excelu (.xlsx)“, nebo jako CSV.')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return wb.worksheets.map((ws) => {
    const matrix: unknown[][] = []
    const cols = ws.columnCount
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const cells: unknown[] = []
      for (let c = 1; c <= cols; c++) cells.push(cellPlain(row.getCell(c).value))
      matrix.push(cells)
    }
    return matrixToSheet(ws.name, matrix)
  })
}

/** Rozdělení "Novák Jan" / "Jan Novák" – hádáme, že příjmení je první (zvyk Škola online). */
export function splitFullName(full: string, lastNameFirst = true): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: '', lastName: parts[0] }
  if (lastNameFirst) return { lastName: parts[0], firstName: parts.slice(1).join(' ') }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

export function applyMapping(rows: Record<string, unknown>[], m: ColumnMapping, lastNameFirst = true): ImportRow[] {
  return rows
    .map((raw) => {
      const out: ImportRow = { raw }
      if (m.className) out.className = String(raw[m.className] ?? '').trim()
      if (m.firstName) out.firstName = String(raw[m.firstName] ?? '').trim()
      if (m.lastName) out.lastName = String(raw[m.lastName] ?? '').trim()
      if (m.fullName && !(out.firstName && out.lastName)) {
        const s = splitFullName(String(raw[m.fullName] ?? ''), lastNameFirst)
        out.firstName ||= s.firstName
        out.lastName ||= s.lastName
      }
      if (m.group) {
        const g = String(raw[m.group] ?? '').trim()
        // prázdná buňka = beze změny; „-“, „–“, „x“, „.“ = výslovně bez skupiny
        if (g) out.group = NO_GROUP_RE.test(g) ? '' : g
      }
      if (m.gradeLevel) {
        const n = Number(String(raw[m.gradeLevel] ?? '').replace(/\D/g, ''))
        if (n) out.gradeLevel = n
      }
      if (m.birthDate) out.birthDate = toISODate(raw[m.birthDate])
      if (m.citizenship) out.citizenship = String(raw[m.citizenship] ?? '').trim()
      if (m.gender) out.gender = parseGender(String(raw[m.gender] ?? ''))
      if (m.catalogNumber) {
        const n = Number(String(raw[m.catalogNumber] ?? '').replace(/\D/g, ''))
        if (n) out.catalogNumber = n
      }
      return out
    })
    .filter((r) => r.lastName || r.firstName)
}

/** Značky „bez skupiny“ ve sloupci Skupina: -, –, —, x, . (i opakované). */
export const NO_GROUP_RE = /^[-–—.x×]+$/i

export type CellValue =
  | { kind: 'empty' }
  | { kind: 'absent' }
  | { kind: 'grade'; grade: number }
  | { kind: 'points'; points: number }
  | { kind: 'invalid'; raw: string }

/**
 * Hodnota buňky se známkou. Bez maxPoints se čeká známka 1–5 nebo „N“ (nehodnocen),
 * s maxPoints nezáporné číslo bodů (i s desetinnou čárkou „7,5“). Cokoli jiného
 * („1-“, „2+“, „výborně“…) je neplatné a import to přeskočí.
 */
export function parseAssessmentCell(v: unknown, maxPoints?: number): CellValue {
  const raw = String(v ?? '').trim()
  if (!raw) return { kind: 'empty' }
  if (/^n$/i.test(raw)) return { kind: 'absent' }
  if (maxPoints) {
    if (!/^\d+([.,]\d+)?$/.test(raw)) return { kind: 'invalid', raw }
    const p = Number(raw.replace(',', '.'))
    return Number.isFinite(p) ? { kind: 'points', points: p } : { kind: 'invalid', raw }
  }
  const m = raw.match(/^([1-5])([.,]0+)?$/)
  return m ? { kind: 'grade', grade: Number(m[1]) } : { kind: 'invalid', raw }
}

/** „Žena“/„Muž“/„F“/„M“/„dívka“/„chlapec“ → M/F */
export function parseGender(v: string): 'M' | 'F' | undefined {
  const n = norm(v)
  if (!n) return undefined
  if (/^(z|f|d|w)/.test(n)) return 'F'
  if (/^(m|ch|b|h)/.test(n)) return 'M'
  return undefined
}

/** Excelové datum (sériové číslo, Date nebo text d.m.rrrr) → ISO */
export function toISODate(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    // sériové číslo Excelu: dny od 30. 12. 1899
    if (v < 1 || v > 2958465) return undefined
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  return undefined
}

/** Z názvu třídy vyčte ročník: "6.A" → 6, "IV.B" → 4 */
export function gradeFromClassName(name: string): number {
  const m = name.match(/^(\d+)/)
  if (m) return Number(m[1])
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9 }
  const r = name.match(/^([IVX]+)/i)
  if (r) return roman[r[1].toUpperCase()] ?? 0
  return 0
}
