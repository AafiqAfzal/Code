import * as XLSX from 'xlsx'

export interface ImportRow {
  className?: string
  firstName?: string
  lastName?: string
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

export async function parseWorkbook(file: File): Promise<ParsedSheet[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  return wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName]
    // Načteme jako matici, najdeme řádek hlavičky (první řádek s ≥ 2 neprázdnými buňkami)
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    let headerIdx = matrix.findIndex((r) => r.filter((c) => String(c).trim() !== '').length >= 2)
    if (headerIdx < 0) headerIdx = 0
    const headers = (matrix[headerIdx] ?? []).map((h, i) => (String(h).trim() ? String(h).trim() : `Sloupec ${i + 1}`))
    const rows: Record<string, unknown>[] = []
    for (const r of matrix.slice(headerIdx + 1)) {
      if (r.every((c) => String(c).trim() === '')) continue
      const obj: Record<string, unknown> = {}
      headers.forEach((h, i) => (obj[h] = r[i] ?? ''))
      rows.push(obj)
    }
    return { sheetName, headers, rows }
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
        out.group = /^[-–—.x]*$/i.test(g) ? '' : g // "-" = bez skupiny
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
    const d = XLSX.SSF.parse_date_code(v)
    if (!d) return undefined
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
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
