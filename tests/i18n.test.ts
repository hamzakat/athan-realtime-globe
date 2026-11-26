import { expect, it } from 'vitest'
import { countryName } from '../src/i18n.ts'

it('shows the country in the interface language', () => {
  expect(countryName('SY', 'en')).toBe('Syria')
  expect(countryName('SY', 'ar')).toBe('سوريا')
})

it('omits a country label when its code is unavailable', () => {
  expect(countryName(undefined, 'en')).toBeUndefined()
  expect(countryName('ZZ', 'ar')).toBeUndefined()
})
