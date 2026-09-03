import { db } from '../db/schema'

const enc = new TextEncoder()
const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

async function hashPin(pin: string, salt: string): Promise<string> {
  // Jednoduché iterované SHA-256 – PIN chrání před nahlédnutím, ne před útočníkem se souborem databáze.
  let data = enc.encode(`${salt}:${pin}`)
  for (let i = 0; i < 5000; i++) data = new Uint8Array(await crypto.subtle.digest('SHA-256', data))
  return toHex(data.buffer as ArrayBuffer)
}

export async function setPin(pin: string, lockAfterMinutes: number) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  await db.settings.update(1, { pinHash: await hashPin(pin, salt), pinSalt: salt, lockAfterMinutes })
}

export async function clearPin() {
  await db.settings.update(1, { pinHash: undefined, pinSalt: undefined })
}

export async function verifyPin(pin: string): Promise<boolean> {
  const s = await db.settings.get(1)
  if (!s?.pinHash || !s.pinSalt) return true
  return (await hashPin(pin, s.pinSalt)) === s.pinHash
}

export const PIN_RE = /^\d{4,8}$/
