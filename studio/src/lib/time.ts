
export const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function safeTz(tz?: string | null): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC' })
    return tz || 'UTC'
  } catch {
    return 'UTC'
  }
}

interface Parts { y: number; m: number; d: number; hh: number; mm: number; wd: string }

export function tzParts(date: Date, tz: string): Parts {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false,
  })
  const p: Record<string, string> = {}
  for (const x of f.formatToParts(date)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour % 24, mm: +p.minute, wd: p.weekday.toLowerCase().slice(0, 3) }
}

/** A wall-clock time in `tz` as a real instant. */
export function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const want = Date.UTC(y, m - 1, d, hh, mm)
  let guess = want
  for (let i = 0; i < 3; i++) {
    const p = tzParts(new Date(guess), tz)
    guess += want - Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm)
  }
  return new Date(guess)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function dayKeyIn(date: Date, tz: string): string {
  const p = tzParts(date, tz)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

export function localKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fmtSlot(date: Date | null, tz: string): string {
  if (!date) return 'now'
  const p = tzParts(date, tz)
  const wd = p.wd[0].toUpperCase() + p.wd.slice(1)
  const soon = Math.abs(date.getTime() - Date.now()) < 6 * 86400000
  const mon = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(date)
  return `${soon ? wd : wd + ' ' + mon} ${pad(p.hh)}:${pad(p.mm)}`
}

export function ago(iso?: string | null): string {
  if (!iso) return ''
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

/** LinkedIn's own relative stamp: "now", "5m", "3h", "2d", "1w". */
export function liStamp(iso?: string | null): string {
  if (!iso) return 'now'
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 604800) return `${Math.floor(s / 86400)}d`
  return `${Math.floor(s / 604800)}w`
}

export function weekStart(offset: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * offset)
  return d
}


/** For <input type="datetime-local">: the browser's local wall clock. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
