import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { CalculationMethod, Coordinates, HighLatitudeRule, PolarCircleResolution, PrayerTimes } from 'adhan'
import { DAY, eventOrder, prayers, utcDay, type City, type Manifest, type PrayerEvent } from '../src/model.ts'
export { utcDay }

export const methods = Object.keys(CalculationMethod).filter(key => key !== 'Other') as Method[]
type Method = Exclude<keyof typeof CalculationMethod, 'Other'>
const dates = new Map<string, Intl.DateTimeFormat>()
const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', month: 'numeric' })
export function localDateAt(at: number, zone: string): string {
  let format = dates.get(zone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: zone, calendar: 'gregory', year: 'numeric', month: '2-digit', day: '2-digit' })
    dates.set(zone, format)
  }
  return format.format(at)
}

function dateForAdhan(at: number): Date {
  const date = new Date(at)
  // Adhan takes the host Date's calendar fields and returns absolute UTC times.
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12)
}

export function eventsForCity(city: City, localDate: string, method: Method): PrayerEvent[] {
  const coordinates = new Coordinates(city.lat, city.lon)
  const params = CalculationMethod[method]()
  params.highLatitudeRule = HighLatitudeRule.recommended(coordinates)
  params.polarCircleResolution = PolarCircleResolution.Unresolved
  const midnight = Date.parse(localDate)
  // The astronomical date and the civil date can differ on either side of the date line.
  let base = midnight
  let times = new PrayerTimes(coordinates, dateForAdhan(base), params)
  const noonDate = localDateAt(+times.dhuhr, city.zone)
  if (noonDate !== localDate) {
    base += midnight - Date.parse(noonDate)
    times = new PrayerTimes(coordinates, dateForAdhan(base), params)
  }
  const valid = (result: PrayerTimes) => ([...prayers, 'sunrise', 'sunset'] as const).every(prayer => Number.isFinite(+result[prayer]))
  const polar = !valid(times)
  if (polar) {
    params.polarCircleResolution = PolarCircleResolution.AqrabBalad
    times = new PrayerTimes(coordinates, dateForAdhan(base), params)
  }
  if (!valid(times)) return []
  // The Hijri date in use after sunset is the next civil day's calendar value.
  const evening = Date.parse(localDateAt(+times.maghrib, city.zone))
  const extraIsha = method === 'UmmAlQura' && hijri.format(evening + DAY) === '9' ? 1_800_000 : 0
  return prayers.map(prayer => ({
    cityId: city.id,
    prayer,
    at: +times[prayer] + (prayer === 'isha' ? extraIsha : 0),
    ...(polar ? { polar: true } : {}),
  }))
}

export const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export function eventsInWindow(cities: City[], method: Method, start: number, end: number): PrayerEvent[] {
  const events: PrayerEvent[] = []
  for (const city of cities) {
    for (let at = start - 2 * DAY; at < end + 2 * DAY; at += DAY) {
      for (const event of eventsForCity(city, utcDay(at), method)) {
        if (event.at >= start && event.at < end) events.push(event)
      }
    }
  }
  return events.sort(eventOrder)
}

function build(now: number, out: string) {
  const cityBytes = readFileSync('public/data/geography/cities.json')
  const cities: City[] = JSON.parse(cityBytes.toString())
  const today = Date.parse(utcDay(now))
  const start = today - 2 * DAY
  const end = today + 3 * DAY
  const manifest: Manifest = { schema: 1, catalog: digest(cityBytes), start, end, methods: {} }
  mkdirSync(out, { recursive: true })
  for (const method of methods) {
    const days: Record<string, number[][]> = {}
    for (let at = start; at < end; at += DAY) days[utcDay(at)] = []
    for (const event of eventsInWindow(cities, method, start, end)) {
      const day = utcDay(event.at)
      const row = [event.at - Date.parse(day), event.cityId, prayers.indexOf(event.prayer)]
      if (event.polar) row.push(1)
      days[day].push(row)
    }
    manifest.methods[method] = {}
    for (const [day, rows] of Object.entries(days)) {
      const bytes = JSON.stringify(rows)
      const hash = digest(bytes)
      const path = `${method}-${day}-${hash.slice(0, 16)}.json`
      const temporary = join(out, `${path}.${process.pid}.tmp`)
      writeFileSync(temporary, bytes)
      renameSync(temporary, join(out, path))
      manifest.methods[method][day] = { path, hash }
    }
  }
  const staging = join(out, `manifest.${process.pid}.tmp`)
  writeFileSync(staging, JSON.stringify(manifest))
  renameSync(staging, join(out, 'manifest.json'))
  console.log(`Generated ${methods.length} prayer methods, ${cities.length} cities, ${utcDay(start)} to ${utcDay(end - 1)} UTC.`)
}

if (import.meta.main) build(Date.now(), 'public/data/schedules')
