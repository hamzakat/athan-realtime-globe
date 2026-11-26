import { expect, it } from 'vitest'
import { markerStrength } from '../src/markers.ts'
const event = { cityId: 1, prayer: 'fajr' as const, at: 0 }
it('flashes once and retains a dim recent dot for five minutes', () => {
  expect(markerStrength(event, 0, 30, 30, false)).toEqual({ recent: 1, flash: 1 })
  expect(markerStrength(event, 2000, 30, 2030, false).flash).toBe(0)
  expect(markerStrength(event, 300000, undefined, 0, false).recent).toBe(0)
})
it('uses steady dots for reduced motion', () => {
  expect(markerStrength(event, 0, 30, 30, true)).toEqual({ recent: 1, flash: 0 })
})
