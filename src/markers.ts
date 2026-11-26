import { RECENT, type Prayer, type PrayerEvent } from './model.ts'
export const colors: Record<Prayer, string> = {
  fajr: '#6cdce6', dhuhr: '#ff927b', asr: '#b8a3ff', maghrib: '#8ee7a3', isha: '#ebe3c4',
}

export function markerStrength(event: PrayerEvent, at: number, pulse: number | undefined, now: number, reduced: boolean, duration = 1150) {
  const recent = Math.max(0, 1 - (at - event.at) / RECENT)
  const flash = pulse === undefined || reduced ? 0 : Math.max(0, 1 - (now - pulse) / duration)
  return { recent, flash }
}
