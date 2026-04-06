import type { GermanHolidayRegion } from '~/types/task'

export interface GermanHolidayEntry {
  dateKey: string
  name: string
}

const REGION_LABELS: Record<GermanHolidayRegion, string> = {
  DE: 'Deutschlandweit',
  BW: 'Baden-Württemberg',
  BY: 'Bayern',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  januar: 0,
  februar: 1,
  maerz: 2,
  april: 3,
  mai: 4,
  juni: 5,
  juli: 6,
  august: 7,
  september: 8,
  oktober: 9,
  november: 10,
  dezember: 11,
}

export function getGermanHolidayRegionOptions() {
  return Object.entries(REGION_LABELS).map(([value, label]) => ({
    value: value as GermanHolidayRegion,
    label,
  }))
}

export function getGermanHolidayEntriesForRange(
  from: Date,
  to: Date,
  region: GermanHolidayRegion,
): GermanHolidayEntry[] {
  const startYear = from.getFullYear()
  const endYear = to.getFullYear()
  const seen = new Set<string>()
  const entries: GermanHolidayEntry[] = []

  for (let year = startYear; year <= endYear; year++) {
    for (const entry of getGermanHolidayEntriesForYear(year, region)) {
      const holidayDate = parseDateKey(entry.dateKey)
      if (holidayDate < stripTime(from) || holidayDate > stripTime(to)) continue

      const key = `${entry.dateKey}-${entry.name}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push(entry)
    }
  }

  return entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

export function getGermanHolidayEntriesForYear(
  year: number,
  region: GermanHolidayRegion,
): GermanHolidayEntry[] {
  const entries: GermanHolidayEntry[] = []
  const easterSunday = calculateEasterSunday(year)

  const addHoliday = (monthIndex: number, day: number, name: string) => {
    entries.push({
      dateKey: toDateKey(createLocalDate(year, monthIndex, day)),
      name,
    })
  }

  const addRelativeHoliday = (offsetDays: number, name: string) => {
    const date = new Date(easterSunday)
    date.setDate(date.getDate() + offsetDays)
    entries.push({
      dateKey: toDateKey(date),
      name,
    })
  }

  addHoliday(0, 1, 'Neujahr')
  addRelativeHoliday(-2, 'Karfreitag')
  addRelativeHoliday(1, 'Ostermontag')
  addHoliday(4, 1, 'Tag der Arbeit')
  addRelativeHoliday(39, 'Christi Himmelfahrt')
  addRelativeHoliday(50, 'Pfingstmontag')
  addHoliday(9, 3, 'Tag der Deutschen Einheit')
  addHoliday(11, 25, '1. Weihnachtstag')
  addHoliday(11, 26, '2. Weihnachtstag')

  if (isRegion(region, ['BW', 'BY', 'ST'])) {
    addHoliday(0, 6, 'Heilige Drei Könige')
  }

  if (isRegion(region, ['BE', 'MV'])) {
    addHoliday(2, 8, 'Internationaler Frauentag')
  }

  if (isRegion(region, ['BW', 'BY', 'HE', 'NW', 'RP', 'SL'])) {
    addRelativeHoliday(60, 'Fronleichnam')
  }

  if (isRegion(region, ['SL'])) {
    addRelativeHoliday(69, 'Mariä Himmelfahrt')
  }

  if (isRegion(region, ['TH'])) {
    addHoliday(8, 20, 'Weltkindertag')
  }

  if (isRegion(region, ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH'])) {
    addHoliday(9, 31, 'Reformationstag')
  }

  if (isRegion(region, ['BW', 'BY', 'NW', 'RP', 'SL'])) {
    addHoliday(10, 1, 'Allerheiligen')
  }

  if (isRegion(region, ['SN'])) {
    const repentanceDay = getRepentanceAndPrayerDay(year)
    entries.push({
      dateKey: toDateKey(repentanceDay),
      name: 'Buß- und Bettag',
    })
  }

  return entries
}

export function parseGermanMonthName(name: string) {
  return MONTH_NAME_TO_INDEX[name]
}

function isRegion(region: GermanHolidayRegion, regions: GermanHolidayRegion[]) {
  return region !== 'DE' && regions.includes(region)
}

function calculateEasterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return createLocalDate(year, month, day)
}

function getRepentanceAndPrayerDay(year: number) {
  const date = createLocalDate(year, 10, 23)
  while (date.getDay() !== 3) {
    date.setDate(date.getDate() - 1)
  }
  return date
}

function stripTime(date: Date) {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

function createLocalDate(year: number, monthIndex: number, day: number) {
  return new Date(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`)
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`)
}
