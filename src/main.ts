import './styles.css'
import { DAY, DEFAULT_METHOD, RECENT, REPLAY_MS, utcDay, type City, type PrayerEvent } from './model.ts'
import type { Globe, Earth } from './globe.ts'
import { asset, CatalogMismatch, loadJson, Schedules, type Schedule } from './schedules.ts'
import { Timeline, type Frame } from './timeline.ts'
import { element, placeLabel, setupShell, Sidebar } from './sidebar.ts'
import { formatTime, messages, methodName, type Locale } from './i18n.ts'

setupShell()
const stored = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const save = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch { /* Storage is optional. */ } }
let locale: Locale = stored('athan-language') === 'ar' ? 'ar' : 'en'
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const methodSelect = element<HTMLSelectElement>('method')
const tooltip = element('tooltip')
const methods = () => Object.keys(schedule?.manifest.methods ?? { [DEFAULT_METHOD]: {} })
let schedule: Schedule | undefined
let repository: Schedules
let timeline: Timeline
let globe: Globe | undefined
let sidebar: Sidebar
let cities = new Map<number, City>()
let current: Frame | undefined
let selection: PrayerEvent | null = null
let selectedCity: number | undefined
let selectedPrayer: PrayerEvent['prayer'] | undefined
let selectedAt = 0
let pending = false
let failed = ''
let sequence = 0
let refreshedDay = ''
let refreshSequence = 0
let retryAfter = 0
let lastClock = ''
let catchUp = false
let lastFrame = 0

function configureMethod() {
  const active = schedule?.method ?? DEFAULT_METHOD
  const keys = methods().sort((a, b) => a === DEFAULT_METHOD ? -1 : b === DEFAULT_METHOD ? 1 : 0)
  methodSelect.replaceChildren(...keys.map(id => new Option(methodName(id, locale), id)))
  methodSelect.value = active
}

function layoutText() {
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
  document.title = messages[locale].title
  for (const node of document.querySelectorAll<HTMLElement>('[data-copy]')) {
    node.textContent = messages[locale][node.dataset.copy as keyof typeof messages.en]
  }
  const language = element<HTMLButtonElement>('locale')
  language.textContent = locale === 'en' ? 'العربية' : 'English'
  language.lang = locale === 'en' ? 'ar' : 'en'
  element('clock-date').textContent = ''
  lastClock = ''
  for (const [id, key] of [['zoom-in','zoomIn'], ['zoom-out','zoomOut'], ['reset-view','reset']] as const) {
    element(id).setAttribute('aria-label', messages[locale][key])
    element(id).title = messages[locale][key]
  }
  element('globe').setAttribute('aria-label', messages[locale].globe)
  element('track').setAttribute('aria-label', messages[locale].today)
  element('mobile-toggle').setAttribute('aria-label', messages[locale].activity)
  element('city-count').textContent = cities.size ? `${cities.size.toLocaleString(locale)} ${messages[locale].cities}` : ''
  configureMethod()
  sidebar?.legend(locale)
  notice()
  if (current) display(current)
  else setStatus(failed ? 'error' : 'loading')
}

function setStatus(mode: Frame['mode'] | 'loading' | 'error') {
  element('state').dataset.state = mode
  element('state-label').textContent = messages[locale][mode === 'error' ? 'statusError' : mode]
}

function notice() {
  element('notice').hidden = !pending && !failed
  element('notice-text').textContent = pending
    ? [schedule && methodName(schedule.method, locale), messages[locale].loading].filter(Boolean).join(' · ')
    : messages[locale].error
  element('retry').hidden = pending
}

function pick(event: PrayerEvent) {
  selection = event
  selectedCity = event.cityId
  selectedPrayer = event.prayer
  selectedAt = event.at
  sidebar.details(selection, schedule!.method, locale, selectedCity)
}

function reselect() {
  if (!schedule || selectedCity === undefined) return
  selection = null
  let difference = Infinity
  for (const event of schedule.events) {
    if (event.cityId !== selectedCity || event.prayer !== selectedPrayer) continue
    const delta = Math.abs(event.at - selectedAt)
    if (delta < difference) { selection = event; difference = delta }
  }
}

function hover(event: PrayerEvent | null, point?: [number, number]) {
  const city = event && cities.get(event.cityId)
  tooltip.hidden = !city
  if (!city || !event || !point) return
  const [x, y] = point
  tooltip.replaceChildren(placeLabel(city, locale),
    ` · ${messages[locale][event.prayer]} · ${formatTime(event.at, city.zone, locale, true)} · ${methodName(schedule!.method, locale)}`)
  tooltip.style.left = `${Math.max(12, Math.min(x + 14, element('globe').clientWidth - tooltip.offsetWidth - 12))}px`
  tooltip.style.top = `${Math.max(68, y - 32)}px`
}

function display(frame: Frame) {
  const key = `${frame.mode}/${Math.floor(frame.at / 60000)}/${locale}`
  if (key !== lastClock) {
    lastClock = key
    setStatus(frame.mode)
    element('clock').textContent = formatTime(frame.at, 'UTC', locale)
    element('clock-date').textContent = new Intl.DateTimeFormat(locale, {timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric'}).format(frame.at)
    const playing = frame.mode === 'replay'
    element('play-label').textContent = messages[locale][playing ? 'pause' : frame.mode === 'paused' ? 'play' : 'replayDay']
    element('play-icon').textContent = playing ? 'Ⅱ' : frame.mode === 'paused' ? '▶' : '↻'
    element('skip').hidden = frame.mode !== 'replay' && frame.mode !== 'paused'
  }
  sidebar.recent(frame.recent, locale, selection)
  sidebar.details(selection, schedule!.method, locale, selectedCity)
}

let replayEnd = 0
function frameLoop(monotonic: number) {
  requestAnimationFrame(frameLoop)
  if (!schedule || monotonic - lastFrame < 24) return
  lastFrame = monotonic
  const now = Date.now()
  if (utcDay(now) !== refreshedDay && !pending && now >= retryAfter) void refresh(now)
  if (catchUp) globe?.clear()
  current = timeline.tick(now, monotonic, schedule.events, schedule.end, schedule.start, catchUp)
  catchUp = false
  const percent = current.mode === 'live' || current.mode === 'expired' ? 100 :
    Math.min(100, Math.max(0, (current.at - (replayEnd - DAY)) / DAY * 100))
  element('progress').style.width = `${percent}%`
  element('track').setAttribute('aria-valuenow', String(Math.round(percent)))
  globe?.draw(current, monotonic, reduced.matches, selection)
  display(current)
}

async function fetchCities() {
  const response = await fetch(asset('geography/cities.json'), {cache: 'no-cache'})
  if (!response.ok) throw new Error('City data unavailable')
  const bytes = await response.arrayBuffer()
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const catalog = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')
  const rows: City[] = JSON.parse(new TextDecoder().decode(bytes))
  return { catalog, rows }
}

async function loadSchedule(method: string, now: number, from: number) {
  try {
    return { next: await repository.load(method, now, from) }
  } catch (error) {
    if (!(error instanceof CatalogMismatch)) throw error
    const {catalog, rows} = await fetchCities()
    const replacement = new Schedules(catalog)
    return { next: await replacement.load(method, now, from), rows, replacement }
  }
}

function applySchedule({next, rows, replacement}: Awaited<ReturnType<typeof loadSchedule>>) {
  schedule = next
  if (!rows || !replacement) return
  repository = replacement
  cities.clear()
  for (const city of rows) cities.set(city.id, city)
  globe?.setCities(rows)
  sidebar.invalidate()
  element('city-count').textContent = `${cities.size.toLocaleString(locale)} ${messages[locale].cities}`
}

async function refresh(now: number) {
  if (!schedule) return
  const token = sequence
  const method = schedule.method
  const refreshToken = ++refreshSequence
  retryAfter = now + 60_000
  try {
    const incoming = await loadSchedule(method, now, Math.min(current?.at ?? now, now - DAY) - RECENT)
    const { next } = incoming
    if (token !== sequence || refreshToken !== refreshSequence || pending) return
    if (timeline.isLive && Date.now() >= schedule.end) catchUp = true
    applySchedule(incoming)
    refreshedDay = now < next.end ? utcDay(now) : ''
    reselect()
  } catch {
    // The current files remain usable until their covered interval ends.
  }
}

async function chooseMethod(method: string) {
  const token = ++sequence
  const wasReplaying = !timeline.isLive
  if (wasReplaying && !timeline.isPaused) {
    timeline.pause(performance.now())
    resumeAfterSwitch = true
  }
  pending = true
  failed = ''
  notice()
  try {
    const now = Date.now()
    const incoming = await loadSchedule(method, now, Math.min(current?.at ?? now, now - DAY) - RECENT)
    const { next } = incoming
    if (token !== sequence) return
    applySchedule(incoming)
    refreshedDay = now < next.end ? utcDay(now) : ''
    const at = timeline.isLive ? Math.min(Date.now(), next.end - 1) : current!.at
    current = timeline.reset(at, next.events)
    save('athan-method', method)
    reselect()
    globe?.clear()
    hover(null)
    configureMethod()
  } catch {
    if (token === sequence) { failed = method; configureMethod() }
  } finally {
    if (token === sequence) {
      pending = false
      notice()
      if (resumeAfterSwitch) timeline.play(performance.now())
      resumeAfterSwitch = false
    }
  }
}
let resumeAfterSwitch = false

function startReplay() {
  if (!schedule) return
  replayEnd = Math.min(Date.now(), schedule.end - 1)
  globe?.clear()
  globe?.beginReplay()
  timeline.replay(replayEnd, performance.now())
}

function renderSky() {
  const canvas = element<HTMLCanvasElement>('sky')
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  canvas.width = canvas.clientWidth
  canvas.height = canvas.clientHeight
  let seed = 63943
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 190; i++) {
    const x = random() * canvas.width
    const y = random() * canvas.height
    ctx.fillStyle = `rgba(195, 231, 220, ${.07 + random() * .31})`
    ctx.beginPath()
    ctx.arc(x, y, random() > .94 ? 1 : .52, 0, Math.PI * 2)
    ctx.fill()
  }
}

async function boot() {
  pending = true
  failed = ''
  setStatus('loading')
  notice()
  try {
    const { catalog, rows } = await fetchCities()
    cities = new Map(rows.map(city => [city.id, city]))
    repository = new Schedules(catalog)
    const saved = stored('athan-method') ?? DEFAULT_METHOD
    const now = Date.now()
    const scheduleRequest = repository.load(saved, now).catch(error => {
      if (saved === DEFAULT_METHOD) throw error
      return repository.load(DEFAULT_METHOD, now)
    })
    const mapRequest = loadJson<Earth>(asset('geography/earth.json')).catch(() => null)
    const [initial, earth] = await Promise.all([scheduleRequest, mapRequest])
    sidebar = new Sidebar(cities, pick, () => { selection = null; selectedCity = undefined; selectedPrayer = undefined })
    if (earth) {
      try {
        const { Globe } = await import('./globe.ts')
        globe = new Globe(element('globe'), earth, rows, pick, hover)
      } catch { /* The sidebar remains available. */ }
    }
    element('globe-fallback').hidden = Boolean(globe)
    element('globe').hidden = !globe
    for (const control of ['zoom-in','zoom-out','reset-view']) element<HTMLButtonElement>(control).disabled = !globe
    const readyAt = Date.now()
    replayEnd = Math.min(readyAt, initial.end - 1)
    timeline = new Timeline(replayEnd, performance.now(), reduced.matches)
    globe?.beginReplay()
    schedule = initial
    refreshedDay = readyAt < initial.end ? utcDay(now) : ''
    pending = false
    methodSelect.disabled = false
    element<HTMLButtonElement>('play').disabled = false
    layoutText()
  } catch {
    pending = false
    failed = DEFAULT_METHOD
    setStatus('error')
    notice()
  }
}

element('locale').onclick = () => {
  locale = locale === 'en' ? 'ar' : 'en'
  save('athan-language', locale)
  hover(null)
  layoutText()
}
element('play').onclick = () => {
  if (!current || pending) return
  if (current.mode === 'paused') timeline.play(performance.now())
  else if (current.mode === 'replay') timeline.pause(performance.now())
  else startReplay()
}
element('skip').onclick = () => {
  if (!current || pending) return
  globe?.clear()
  timeline.skip(Date.now(), schedule!.events)
}
element('retry').onclick = () => { if (schedule) void chooseMethod(failed); else void boot() }
methodSelect.onchange = () => void chooseMethod(methodSelect.value)
element('zoom-in').onclick = () => globe?.zoom(true)
element('zoom-out').onclick = () => globe?.zoom(false)
element('reset-view').onclick = () => globe?.reset()
element('mobile-toggle').onclick = () => {
  const body = element('sidebar-body')
  body.classList.toggle('mobile-closed')
  const expanded = !body.classList.contains('mobile-closed')
  element('mobile-toggle').setAttribute('aria-expanded', String(expanded))
  element('mobile-toggle').textContent = expanded ? '−' : '+'
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !schedule) return
  catchUp = true
  if (!pending) void refresh(Date.now())
})
new ResizeObserver(renderSky).observe(element('sky'))
layoutText()
element('play-label').textContent = messages[locale].replayDay
element<HTMLButtonElement>('play').disabled = true
element('skip').hidden = true
void boot()
requestAnimationFrame(frameLoop)
