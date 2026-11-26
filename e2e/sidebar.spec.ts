import { expect, test } from '@playwright/test'

test('switches methods while paused, persists success and retains the old method on failure', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', {name: 'Pause', exact: true}).click()
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'paused')
  const clock = await page.locator('#clock').textContent()
  const select = page.getByRole('combobox', {name:'Calculation method'})
  await expect(select).toHaveValue('UmmAlQura')
  await select.selectOption('MuslimWorldLeague')
  await expect(select).toHaveValue('MuslimWorldLeague')
  await expect(page.locator('#notice')).toBeHidden()
  await expect(page.locator('#clock')).toHaveText(clock!)
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'paused')
  await page.route('**/schedules/Tehran-*.json', route => route.abort())
  await select.selectOption('Tehran')
  await expect(page.getByRole('button', {name:'Retry'})).toBeVisible()
  await expect(select).toHaveValue('MuslimWorldLeague')
  await page.reload()
  await expect(select).toHaveValue('MuslimWorldLeague')
})

test('a delayed response cannot undo a newer method choice', async ({page}) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/schedules/Tehran-*.json', async route => {
    await gate
    await route.continue()
  })
  await page.emulateMedia({reducedMotion: 'reduce'})
  await page.goto('./')
  await expect(page.locator('#state')).toHaveAttribute('data-state', 'live')
  const select = page.getByRole('combobox', {name:'Calculation method'})
  const requested = page.waitForRequest('**/schedules/Tehran-*.json')
  await select.selectOption('Tehran')
  await requested
  await select.selectOption('Dubai')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('athan-method'))).toBe('Dubai')
  const older = page.waitForResponse('**/schedules/Tehran-*.json')
  release()
  await older
  await expect(select).toHaveValue('Dubai')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('athan-method'))).toBe('Dubai')
})
