import { expect, it } from 'vitest'
import { Timeline } from '../src/timeline.ts'
import { DAY, type PrayerEvent } from '../src/model.ts'

const midnight = Date.parse('2026-11-26T00:00Z')
const events: PrayerEvent[] = [
  { at: midnight, cityId: 1, prayer: 'fajr' },
  { at: midnight, cityId: 2, prayer: 'isha' },
  { at: midnight + 1000, cityId: 2, prayer: 'fajr' },
]

it('completes its full day sweep and starts live without repeating events', () => {
  const clock = new Timeline(midnight, 0, false)
  expect(clock.tick(midnight, 0, events).at).toBe(midnight - DAY)
  expect(clock.tick(midnight, 12000, events).arrivals).toEqual(events.slice(0, 2))
  expect(clock.tick(midnight, 12001, events).mode).toBe('live')
  expect(clock.tick(midnight + 1000, 13000, events).arrivals).toEqual(events.slice(2))
  expect(clock.tick(midnight + 1000, 13001, events).arrivals).toEqual([])
})
it('resumes with recent dots and ignores arrivals missed during sleep', () => {
  const clock = new Timeline(midnight - 10, 0, true)
  const frame = clock.reset(midnight, events)
  expect(frame.arrivals).toEqual([])
  expect(frame.recent).toEqual(events.slice(0, 2))
  expect(clock.tick(midnight + 1000, 1000, events).arrivals).toEqual(events.slice(2))
})
it('keeps the cursor frozen during pause and cancels live on expired data', () => {
  const clock = new Timeline(midnight, 0, false)
  clock.tick(midnight, 2000, events)
  clock.pause(2000)
  const frame = clock.tick(midnight + 5000, 7000, events)
  expect(frame.at).toBe(midnight - DAY * 5 / 6)
  expect(frame.mode).toBe('paused')
  clock.skip(midnight, events)
  expect(clock.tick(midnight + 1000, 8000, events, midnight + 1000).mode).toBe('expired')
})

it('suppresses past arrivals when a sleeping replay reaches live', () => {
  const clock = new Timeline(midnight, 0, false)
  const frame = clock.tick(midnight + 1000, 12001, events, Infinity, -Infinity, true)
  expect(frame.mode).toBe('live')
  expect(frame.recent).toEqual(events)
  expect(frame.arrivals).toEqual([])
})

it('resumes from expired coverage with recent dots and only flashes subsequent events', () => {
  const clock = new Timeline(midnight - 1000, 0, true)
  expect(clock.tick(midnight, 1, [], midnight).mode).toBe('expired')
  expect(clock.tick(midnight + 500, 2, events, Infinity, -Infinity, true).arrivals).toEqual([])
  expect(clock.tick(midnight + 1000, 3, events).arrivals).toEqual(events.slice(2))
})

it('finishes a long-paused replay without flashing the intervening live events', () => {
  const clock = new Timeline(midnight, 0, false)
  clock.pause(5000)
  clock.play(60_000)
  const frame = clock.tick(midnight + 1000, 67_000, events)
  expect(frame.at).toBe(midnight + 1000)
  expect(frame.arrivals).toEqual(events.slice(0, 2))
})
