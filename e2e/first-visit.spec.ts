import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { DAY, utcDay, type City, type Manifest } from '../src/model.ts'
import { digest } from '../scripts/schedules.ts'

const load = <T>(file: string) => JSON.parse(readFileSync('dist/data/' + file, 'utf8')) as T
const manifest = () => load<Manifest>('schedules/manifest.json')
const cityCatalog = () => load<City[]>('geography/cities.json')
const damascus = () => cityCatalog().find(city => city.zone === 'Asia/Damascus' && city.id === 170654)!

test('keeps the zoomed globe open across midnight and shows one new event', async ({page}) => {
  const date = manifest().start + 2 * DAY
  const city = damascus()
  await page.clock.setFixedTime(date - 8000)
  await page.route('**/schedules/UmmAlQura-*.json', route =>
    route.fulfill({json: route.request().url().includes('UmmAlQura-' + utcDay(date)) ? [[0, city.id, 0]] : []}))
  await page.goto('./')
  await page.getByRole('button', {name: 'Skip to live'}).click()
  await page.getByRole('button', {name: 'Zoom in', exact: true}).click()
  await expect(page.locator('.activity-row')).toHaveCount(0)
  await page.clock.setFixedTime(date + 100)
  const row = page.locator('.activity-row', {hasText: city.name})
  await expect(row).toHaveCount(1)
  await expect(row.getByText('Syria', {exact: true})).toBeVisible()
  await expect(page.locator('#clock')).toHaveText('00:00')
  const dot = await page.locator('canvas.globe-overlay').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    let peak = 0
    let pixel = 0
    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > peak) {
        peak = pixels[i]
        pixel = (i - 3) / 4
      }
    }
    const box = canvas.getBoundingClientRect()
    return {
      peak,
      x: box.left + (pixel % canvas.width) * box.width / canvas.width,
      y: box.top + Math.floor(pixel / canvas.width) * box.height / canvas.height,
    }
  })
  expect(dot.peak).toBeGreaterThan(200)
  await page.mouse.move(dot.x, dot.y)
  await expect(page.locator('#tooltip').getByText('Syria', {exact: true})).toBeVisible()
  await row.click()
  await expect(page.locator('#selection').getByText('Syria', {exact: true})).toBeVisible()
  await page.getByRole('button', {name: 'العربية'}).click()
  await expect(row.getByText('سوريا', {exact: true})).toBeVisible()
  await expect(page.locator('#selection').getByText('سوريا', {exact: true})).toBeVisible()
})

test('loads a changed city catalog while live and preserves the active method', async ({page}) => {
  const original = manifest()
  const midnight = original.start + 3 * DAY
  const rows = cityCatalog()
  const city = damascus()
  const changed = rows.map(row => row.id === city.id ? {...row, name: 'Damascus Updated'} : row)
  const bytes = JSON.stringify(changed)
  let published = false
  await page.clock.setFixedTime(midnight - 1000)
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.route('**/geography/cities.json', route => published ?
    route.fulfill({contentType: 'application/json', body: bytes}) : route.continue())
  await page.route('**/schedules/manifest.json', route => published ?
    route.fulfill({json: {...original, catalog: digest(bytes)}}) : route.continue())
  await page.route('**/schedules/UmmAlQura-*.json', route =>
    route.fulfill({json: route.request().url().includes('UmmAlQura-' + utcDay(midnight)) ? [[0, city.id, 0]] : []}))
  await page.goto('./')
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'live')
  published = true
  await page.clock.setFixedTime(midnight + 50)
  await expect(page.locator('.activity-row', {hasText: 'Damascus Updated'})).toHaveCount(1)
  await expect(page.getByRole('combobox')).toHaveValue('UmmAlQura')
})

test('shows a retry when the initial schedule is unavailable', async ({page}) => {
  await page.route('**/schedules/manifest.json', route => route.abort())
  await page.goto('./')
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'error')
  await page.unroute('**/schedules/manifest.json')
  await page.getByRole('button', {name: 'Retry'}).click()
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'replay')
})
