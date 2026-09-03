import mammoth from 'mammoth'

export interface ExtractedItem {
  text: string
  level: number
  month?: string
  hours?: number
}

const MONTH_RE = /(?<!\p{L})(z[aá][rř][ií]|[rř][ií]jen|listopad|prosinec|leden|[uú]nor|b[rř]ezen|duben|kv[eě]ten|[cč]erven)(?!\p{L})/iu
const MONTH_NORMALIZE: Record<string, string> = {
  zari: 'září', rijen: 'říjen', listopad: 'listopad', prosinec: 'prosinec', leden: 'leden',
  unor: 'únor', brezen: 'březen', duben: 'duben', kveten: 'květen', cerven: 'červen',
}
const TABLE_HEADER_WORDS = new Set(['mesic', 'tema', 'temata', 'hodin', 'hodiny', 'pocet hodin', 'hod.', 'ucivo', 'poznamka', 'poznamky', 'obdobi', 'vystupy', 'ocekavane vystupy', 'prurezova temata', 'cislo', 'c.', 'tematicky celek', 'celek'])
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

function detectMonth(text: string): string | undefined {
  const m = text.match(MONTH_RE)
  return m ? MONTH_NORMALIZE[fold(m[1])] : undefined
}

function detectHours(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(h|hod|hodin|vyuč)/i)
  return m ? Number(m[1]) : undefined
}

/**
 * Detekce textu ve Word dokumentu: převedeme .docx na HTML (mammoth),
 * z něj vyčteme nadpisy, odstavce, odrážky a řádky tabulek.
 */
export async function extractDocx(file: File): Promise<{ items: ExtractedItem[]; rawText: string }> {
  const arrayBuffer = await file.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
  const { value: rawText } = await mammoth.extractRawText({ arrayBuffer })
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const items: ExtractedItem[] = []
  let currentMonth: string | undefined

  const push = (text: string, level: number) => {
    const t = text.replace(/\s+/g, ' ').trim()
    if (!t || t.length < 2) return
    const month = detectMonth(t)
    if (month) currentMonth = month
    // řádek tvořený jen názvem měsíce → nadpis (level 0)
    const onlyMonth = month && fold(t).replace(/[^a-z]/g, '') === fold(month)
    items.push({ text: t, level: onlyMonth ? 0 : level, month: currentMonth, hours: detectHours(t) })
  }

  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase()
      if (/^h[1-6]$/.test(tag)) push(child.textContent ?? '', 0)
      else if (tag === 'p') push(child.textContent ?? '', child.querySelector('strong') && (child.textContent ?? '').length < 80 ? 0 : 1)
      else if (tag === 'li') push(child.textContent ?? '', 1)
      else if (tag === 'tr') {
        const cells = Array.from(child.querySelectorAll('td,th')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean)
        if (cells.length) {
          const isHeader = child.querySelector('th') != null || cells.every((c) => TABLE_HEADER_WORDS.has(fold(c)))
          if (!isHeader) {
            // buňka jen s názvem měsíce → měsíc, čistě číselná buňka → hodinová dotace, zbytek = text tématu
            let month: string | undefined
            let hours: number | undefined
            const textCells: string[] = []
            for (const c of cells) {
              const m = detectMonth(c)
              if (m && fold(c).replace(/[^a-z]/g, '') === fold(m)) month = m
              else if (/^\d{1,3}$/.test(c)) hours = Number(c)
              else textCells.push(c)
            }
            if (month) currentMonth = month
            const text = textCells.join(' – ')
            if (text) items.push({ text, level: 1, month: currentMonth, hours: hours ?? detectHours(text) })
          }
        }
      } else if (tag === 'table' || tag === 'tbody' || tag === 'thead' || tag === 'ul' || tag === 'ol') walk(child)
      else walk(child)
    }
  }
  walk(doc.body)
  return { items, rawText }
}

/** Fallback pro .txt / vložený text: každý neprázdný řádek = položka. */
export function extractPlainText(text: string): ExtractedItem[] {
  let currentMonth: string | undefined
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((t) => {
      const month = detectMonth(t)
      if (month) currentMonth = month
      const onlyMonth = month && fold(t).replace(/[^a-z]/g, '') === fold(month)
      const isHeading = onlyMonth || /^(\d+\.|[IVX]+\.|unit|lekce|tematick[yý] celek)/i.test(t)
      return { text: t.replace(/^[-•*]\s*/, ''), level: isHeading ? 0 : 1, month: currentMonth, hours: detectHours(t) }
    })
}
