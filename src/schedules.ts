import { DAY, RECENT, eventOrder, prayers, utcDay, type Manifest, type PrayerEvent } from './model.ts'

export type Schedule = { manifest: Manifest, method: string, events: PrayerEvent[], start: number, end: number }
export const asset = (path: string) => import.meta.env.BASE_URL + 'data/' + path

export async function loadJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`)
  return response.json() as Promise<T>
}

export class CatalogMismatch extends Error {}

export class Schedules {
  private cache = new Map<string, Promise<PrayerEvent[]>>()
  constructor(private catalog: string) {}

  async load(method: string, now: number, from = now - DAY - RECENT): Promise<Schedule> {
    const folder = 'schedules/'
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const manifest = await loadJson<Manifest>(asset(folder + 'manifest.json'), { cache: 'no-cache' })
        if (manifest.schema !== 1) throw new Error('Unsupported schedule schema')
        if (manifest.catalog !== this.catalog) throw new CatalogMismatch('Schedule and city catalog differ')
        const files = manifest.methods[method]
        if (!files) throw new Error('Unknown calculation method')
        const first = Math.min(manifest.end - 2 * DAY, Math.max(manifest.start, Date.parse(utcDay(from))))
        const last = Math.min(manifest.end, Math.max(first + DAY, Date.parse(utcDay(now)) + 2 * DAY))
        const requests: Promise<PrayerEvent[]>[] = []
        for (let day = first; day < last; day += DAY) {
          const file = files[utcDay(day)]
          if (!file) throw new Error('Missing calendar day')
          let request = this.cache.get(file.path)
          if (!request) {
            request = loadJson<number[][]>(asset(folder + file.path)).then(rows =>
              rows.map(([offset, cityId, prayer, polar]) => ({
                at: day + offset, cityId, prayer: prayers[prayer], ...(polar ? { polar: true } : {}),
              }))).catch(error => {
                this.cache.delete(file.path)
                throw error
              })
            this.cache.set(file.path, request)
          }
          requests.push(request)
        }
        // Keep only files present in the current release as the tab stays open.
        const valid = new Set(Object.values(manifest.methods).flatMap(days => Object.values(days).map(file => file.path)))
        for (const path of this.cache.keys()) if (!valid.has(path)) this.cache.delete(path)
        const events = (await Promise.all(requests)).flat().sort(eventOrder)
        return { manifest, method, events, start: first, end: last }
      } catch (error) {
        if (attempt === 1) throw error
      }
    }
    throw new Error('Could not load schedules')
  }
}
