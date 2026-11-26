import { expect, it } from 'vitest'
import { eventsForCity, utcDay, localDateAt } from '../scripts/schedules.ts'
const mecca = { id: 1, name: 'Makkah', lat: 21.4225, lon: 39.8262, zone: 'Asia/Riyadh' }
it('uses 120 minutes for Isha on the first Ramadan evening and 90 after Ramadan', () => {
  const interval = (date: string) => {
    const events = eventsForCity(mecca, date, 'UmmAlQura')
    expect(events).toHaveLength(5)
    return (events[4].at - events[3].at) / 60000
  }
  expect(interval('2026-02-16')).toBe(90)
  expect(interval('2026-02-17')).toBe(120)
  expect(interval('2026-03-18')).toBe(120)
  expect(interval('2026-03-19')).toBe(90)
  expect(interval('2026-03-20')).toBe(90)
})
it('assigns local dates at either side of the date line and Europe DST correctly', () => {
  const at = Date.parse('2026-03-29T11:00Z')
  expect(localDateAt(at, 'Pacific/Kiritimati')).toBe('2026-03-30')
  expect(localDateAt(at, 'Pacific/Pago_Pago')).toBe('2026-03-29')
  expect(utcDay(at)).toBe('2026-03-29')
  expect(localDateAt(Date.parse('2026-03-29T22:30Z'), 'Europe/Paris')).toBe('2026-03-30')
})
it('applies polar recovery and yields valid events', () => {
  const events = eventsForCity({id:2,name:'Tromsø',lat:69.65,lon:18.96,zone:'Europe/Oslo'}, '2026-06-21', 'MuslimWorldLeague')
  expect(events).toHaveLength(5)
  expect(events.every(e => Number.isFinite(e.at) && e.polar)).toBe(true)
})

it.each([
  [{ id: 2, name: 'Kiritimati', lat: 1.87, lon: -157.36, zone: 'Pacific/Kiritimati' }, '2026-03-28'],
  [{ id: 3, name: 'Pago Pago', lat: -14.28, lon: -170.7, zone: 'Pacific/Pago_Pago' }, '2026-03-29'],
])('generates a civil day on either side of the date line for $name', (city, firstUtcDate) => {
  const events = eventsForCity(city, '2026-03-29', 'UmmAlQura')
  expect(events.map(e => localDateAt(e.at, city.zone))).toEqual(Array(5).fill('2026-03-29'))
  expect(utcDay(events[0].at)).toBe(firstUtcDate)
})

it('generates Paris noon using the changed clock on DST Sunday', () => {
  const city = { id: 4, name: 'Paris', lat: 48.857, lon: 2.352, zone: 'Europe/Paris' }
  const dhuhr = eventsForCity(city, '2026-03-29', 'MuslimWorldLeague').find(e => e.prayer === 'dhuhr')!
  expect(new Date(dhuhr.at).toISOString()).toBe('2026-03-29T11:56:00.000Z')
  expect(new Intl.DateTimeFormat('en-GB', {timeZone: city.zone, timeStyle: 'short'}).format(dhuhr.at)).toBe('13:56')
})

it('matches the published MUIS Singapore timetable within one minute on 26 November 2026', () => {
  // https://www.muis.gov.sg/resources/islamic-calendar/ (Prayer timetable 2026, November 26)
  const reference = [5 * 60 + 29, 12 * 60 + 54, 16 * 60 + 17, 18 * 60 + 54, 20 * 60 + 8]
  const city = {id: 5, name: 'Singapore', lat: 1.28967, lon: 103.85007, zone: 'Asia/Singapore'}
  const format = new Intl.DateTimeFormat('en-GB', {timeZone: city.zone, timeStyle: 'short'})
  const calculated = eventsForCity(city, '2026-11-26', 'Singapore').map(event => {
    const [hour, minute] = format.format(event.at).split(':').map(Number)
    return hour * 60 + minute
  })
  expect(calculated).toHaveLength(reference.length)
  expect(calculated.map((value, index) => Math.abs(value - reference[index]))).toEqual([1, 1, 1, 0, 0])
})
