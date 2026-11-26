export const DAY = 86_400_000
export const RECENT = 300_000
export const REPLAY_MS = 12_000
export const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const
export type Prayer = typeof prayers[number]
export type City = { id: number, name: string, lat: number, lon: number, zone: string, country?: string }
export type PrayerEvent = { at: number, cityId: number, prayer: Prayer, polar?: boolean }
export type DayFile = { path: string, hash: string }
export type Manifest = {
  schema: 1
  catalog: string
  start: number
  end: number
  methods: Record<string, Record<string, DayFile>>
}
export const DEFAULT_METHOD = 'UmmAlQura'
export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10)
export const eventKey = (event: PrayerEvent) => `${event.at}/${event.cityId}/${event.prayer}`
export const eventOrder = (a: PrayerEvent, b: PrayerEvent) =>
  a.at - b.at || a.cityId - b.cityId || prayers.indexOf(a.prayer) - prayers.indexOf(b.prayer)
