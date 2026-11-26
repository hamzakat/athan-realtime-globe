import { expect, test } from '@playwright/test'

test('replays into live, supports zoom, then lets a visitor open a city', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'The Sound of athan Constantly Echoes Around the Globe', exact: true })).toBeVisible()
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'replay')
  await expect(page.locator('canvas.globe-surface')).toBeVisible()
  await page.getByRole('button', {name: 'Zoom in', exact: true}).click()
  await page.getByRole('button', {name: 'Zoom out', exact: true}).click()
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'live', {timeout: 17_000})
  await expect(page.locator('.activity-row').first()).toBeVisible()
  await page.locator('.activity-row').first().focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Selected Athan' })).toBeVisible()
  await expect(page.locator('#selection')).toContainText('Umm al-Qura')
  expect(errors).toEqual([])
})

test('reduced-motion phone opens in live and supports an Arabic layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('./')
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'live')
  await page.getByRole('button', {name: 'العربية'}).click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByRole('heading', {name: 'صوت الأذان لاينقطع', exact: true})).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'طريقة الحساب' })).toHaveValue('UmmAlQura')
  await page.getByRole('button', {name: 'الأذان', exact: true}).click()
  await expect(page.getByRole('combobox')).toBeHidden()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
