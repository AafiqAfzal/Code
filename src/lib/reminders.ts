import { addDays } from 'date-fns'
import { db, type CalendarEvent } from '../db/schema'
import { EVENT_KINDS, fmtDate, todayISO } from './format'

export interface Reminder { event: CalendarEvent; when: 'dnes' | 'zítra' | 'po termínu' }

/** Události dnes, zítra a nesplněné termíny po datu. */
export async function collectReminders(): Promise<Reminder[]> {
  const today = todayISO()
  const tomorrow = addDays(new Date(), 1).toISOString().slice(0, 10)
  const events = await db.events.where('date').belowOrEqual(tomorrow).filter((e) => !e.done).toArray()
  return events
    .map((e): Reminder => ({ event: e, when: e.date === today ? 'dnes' : e.date === tomorrow ? 'zítra' : 'po termínu' }))
    .filter((r) => r.when !== 'po termínu' || r.event.kind === 'ukol' || r.event.date >= addDays(new Date(), -14).toISOString().slice(0, 10))
    .sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.timeFrom ?? '').localeCompare(b.event.timeFrom ?? ''))
}

function notifiedKey() { return `reminded-${todayISO()}` }

/** Pošle systémová oznámení pro dnešní a zítřejší události – každou jen jednou denně. */
export async function pushReminderNotifications() {
  const settings = await db.settings.get(1)
  if (settings?.remindersEnabled === false) return
  const reminders = (await collectReminders()).filter((r) => r.when !== 'po termínu')
  if (reminders.length === 0) return
  let done: number[] = []
  try { done = JSON.parse(localStorage.getItem(notifiedKey()) ?? '[]') } catch { /* ignore */ }
  const fresh = reminders.filter((r) => !done.includes(r.event.id))
  if (fresh.length === 0) return
  const title = fresh.length === 1 ? `${fresh[0].when === 'dnes' ? 'Dnes' : 'Zítra'}: ${fresh[0].event.title}` : `${fresh.length} připomínek`
  const body = fresh.map((r) => `${r.when === 'dnes' ? 'Dnes' : 'Zítra'} ${fmtDate(r.event.date, 'd. M.')}${r.event.timeFrom ? ` ${r.event.timeFrom}` : ''} · ${EVENT_KINDS[r.event.kind].label}: ${r.event.title}`).join('\n')
  if (window.denik) await window.denik.notify(title, body)
  else if ('Notification' in window) {
    if (Notification.permission === 'default') await Notification.requestPermission()
    if (Notification.permission === 'granted') new Notification(title, { body })
  }
  try { localStorage.setItem(notifiedKey(), JSON.stringify([...done, ...fresh.map((r) => r.event.id)])) } catch { /* ignore */ }
}
