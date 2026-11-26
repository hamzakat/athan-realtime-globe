import { describe, expect, it } from 'vitest'
import { selectCities, parseCity, compactLines } from '../scripts/geography.ts'

const city = (id: number, lat: number, lon: number, population: number, capital = false) =>
  ({ id, name: 'City ' + id, lat, lon, zone: 'Etc/UTC', population, capital })

describe('geography', () => {
  it('selects capitals and geographically distinct small towns deterministically', () => {
    const rows = [city(1, 0, 0, 1, true), city(2, 1, 1, 9000), city(3, 2, 2, 8000), city(4, -21, -175, 12)]
    expect(selectCities(rows, 3).map(c => c.id)).toEqual([1, 2, 4])
    expect(selectCities(rows.toReversed(), 3)).toEqual(selectCities(rows, 3))
  })
  it('rejects invalid coordinates and zones', () => {
    const fields = Array(19).fill('')
    Object.assign(fields, {0:'42', 1:'Example', 4:'33', 5:'36', 7:'PPLC', 14:'100', 17:'Asia/Damascus'})
    expect(parseCity(fields.join('\t'))?.zone).toBe('Asia/Damascus')
    for (const code of ['PPLX', 'PPLQ', 'PPLH', 'PPLW']) {
      fields[7] = code
      expect(parseCity(fields.join('\t'))).toBeNull()
    }
    fields[7] = 'PPLC'
    fields[17] = 'Invalid/Zone'
    expect(parseCity(fields.join('\t'))).toBeNull()
  })
  it('keeps distinct lines on both sides of the date line', () => {
    expect(compactLines([[[179, 3], [180, 4]], [[-180, 4], [-179, 5]]])).toHaveLength(2)
  })
})
