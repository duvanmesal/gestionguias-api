export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

export function addDays(date: Date, days: number) {
  return addMinutes(date, days * 24 * 60)
}

export function bogotaDate(y: number, m: number, d: number, hh: number, mm = 0, ss = 0) {
  return new Date(Date.UTC(y, m - 1, d, hh + 5, mm, ss))
}

export function getBogotaYMD(now: Date) {
  const bogotaMs = now.getTime() - 5 * 60 * 60 * 1000
  const date = new Date(bogotaMs)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

export function ymdBogota(now: Date) {
  const { y, m, d } = getBogotaYMD(now)
  return `${y}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`
}

export function dayStartBogota(now: Date) {
  const { y, m, d } = getBogotaYMD(now)
  return bogotaDate(y, m, d, 0)
}

export function timeOnBogotaDay(dayStart: Date, hour: number, minute = 0) {
  return addMinutes(dayStart, hour * 60 + minute)
}
