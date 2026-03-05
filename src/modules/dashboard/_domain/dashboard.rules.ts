function pad2(n: number) {
  return String(n).padStart(2, "0")
}

/**
 * Convierte un Date "ahora" a un YYYY-MM-DD del "día local" definido por tzOffsetMinutes.
 */
export function toLocalDateString(now: Date, tzOffsetMinutes: number): string {
  // localTime = utcTime + offset
  const localMs = now.getTime() + tzOffsetMinutes * 60_000
  const d = new Date(localMs)
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  return `${y}-${pad2(m)}-${pad2(day)}`
}

/**
 * Dado un YYYY-MM-DD y un offset, construye el rango UTC [start, end)
 * correspondiente al día local.
 */
export function buildUtcDayRange(
  dateStr: string,
  tzOffsetMinutes: number,
): { start: Date; end: Date } {
  const [yS, mS, dS] = dateStr.split("-")
  const y = Number(yS)
  const m = Number(mS)
  const d = Number(dS)

  // startLocal = YYYY-MM-DD 00:00:00.000
  // startUtc = startLocal - offset
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - tzOffsetMinutes * 60_000
  const endUtcMs = Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0) - tzOffsetMinutes * 60_000

  return { start: new Date(startUtcMs), end: new Date(endUtcMs) }
}

/**
 * Semana "local" (Lunes..Domingo) basada en un YYYY-MM-DD + tzOffsetMinutes.
 * Retorna rango UTC [start, end)
 */
export function buildUtcWeekRange(
  dateStr: string,
  tzOffsetMinutes: number,
): { start: Date; end: Date } {
  const [yS, mS, dS] = dateStr.split("-")
  const y = Number(yS)
  const m = Number(mS)
  const d = Number(dS)

  // dayOfWeek for the local date (0 Sun..6 Sat)
  const dow = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).getUTCDay()
  // Monday-start week
  const offsetToMonday = (dow + 6) % 7
  const mondayUtcMs =
    Date.UTC(y, m - 1, d - offsetToMonday, 0, 0, 0, 0) - tzOffsetMinutes * 60_000
  const endUtcMs = mondayUtcMs + 7 * 24 * 60 * 60 * 1000
  return { start: new Date(mondayUtcMs), end: new Date(endUtcMs) }
}

export function toISO(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null
}

export function tzHintFromOffset(tzOffsetMinutes: number): string {
  // UI hint only. Si luego quieres iana real, lo puedes pasar desde el front.
  if (tzOffsetMinutes === -300) return "America/Bogota"
  const sign = tzOffsetMinutes >= 0 ? "+" : "-"
  const abs = Math.abs(tzOffsetMinutes)
  const hh = Math.floor(abs / 60)
  const mm = abs % 60
  return `UTC${sign}${pad2(hh)}:${pad2(mm)}`
}