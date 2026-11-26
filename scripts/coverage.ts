import { readFileSync } from 'node:fs'
import { DAY, DEFAULT_METHOD, type City } from '../src/model.ts'
import { eventsInWindow } from './schedules.ts'

const cities: City[] = JSON.parse(readFileSync('public/data/geography/cities.json', 'utf8'))
const year = new Date().getUTCFullYear()
for (const season of ['03-20', '06-21', '09-22', '12-21']) {
  const start = Date.parse(`${year}-${season}`)
  const end = start + DAY
  const events = eventsInWindow(cities, DEFAULT_METHOD, start, end)
  const cityById = new Map(cities.map(city => [city.id, city]))
  function longestGap(times: number[]): number {
    const bounds = [start, ...times, end]
    return Math.max(...bounds.slice(1).map((time, index) => time - bounds[index])) / 60000
  }
  const regions = Array.from({ length: 6 }, (_, i) => {
    const west = i * 60 - 180
    const times = events.filter(e => {
      const lon = cityById.get(e.cityId)!.lon
      return lon >= west && lon < west + 60
    }).map(e => e.at)
    return `${west}° to ${west + 60}°: ${times.length} events, ${longestGap(times)} min gap`
  })
  console.log(`${year}-${season} · ${events.length} events · ${longestGap(events.map(e => e.at))} min longest global gap\n  ${regions.join(' | ')}`)
}
