import { colors } from './markers.ts'
import { countryName, formatTime, messages, methodName, type Locale } from './i18n.ts'
import { eventKey, prayers, type City, type PrayerEvent } from './model.ts'

export function element<T extends HTMLElement = HTMLElement>(id: string) {
  return document.getElementById(id) as T
}

export function placeLabel(city: City, locale: Locale) {
  const label = document.createElement('span')
  label.className = 'place-label'
  const name = document.createElement('bdi')
  name.textContent = city.name
  label.append(name)
  const country = countryName(city.country, locale)
  if (country) {
    const region = document.createElement('bdi')
    region.className = 'place-country'
    region.textContent = country
    label.append(locale === 'ar' ? '، ' : ', ', region)
  }
  return label
}

export function setupShell() {
  element('app').innerHTML = `
    <header class="masthead">
      <a class="brand" href="./"><span class="brand-icon" aria-hidden="true"><i></i></span><span data-copy="title"></span></a>
      <button id="locale" class="language" type="button" lang="ar">العربية</button>
    </header>
    <main class="layout">
      <section class="observatory" aria-labelledby="heading">
        <canvas id="sky" class="sky" aria-hidden="true"></canvas>
        <div class="intro">
          <span class="intro-line"></span>
          <h1 id="heading" data-copy="explore"></h1>
          <p data-copy="intro"></p>
        </div>
        <div class="clock-block">
          <span id="state" class="state" data-state="loading"><i></i><span id="state-label"></span></span>
          <div class="clock"><b id="clock">–:–</b><span>UTC</span></div>
          <div id="clock-date" class="clock-date"></div>
        </div>
        <div id="globe" class="globe"><div id="tooltip" class="tooltip" hidden></div></div>
        <div id="globe-fallback" class="globe-fallback" hidden data-copy="unavailable"></div>
        <div class="globe-tools">
          <button id="zoom-in" type="button">+</button>
          <button id="zoom-out" type="button">−</button>
          <button id="reset-view" type="button"><span aria-hidden="true">⌖</span></button>
        </div>
        <div class="map-hint"><span data-copy="interaction"></span><span id="city-count"></span></div>
        <div class="transport">
          <div class="transport-main">
            <button id="play" class="primary" type="button"><span id="play-icon" aria-hidden="true">↻</span><span id="play-label"></span></button>
            <button id="skip" class="quiet" type="button" data-copy="skip"></button>
          </div>
          <div class="track-area">
            <div class="track" id="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i id="progress"></i></div>
            <div class="track-labels"><span data-copy="ago"></span><span data-copy="now"></span></div>
          </div>
        </div>
      </section>
      <aside class="sidebar" aria-labelledby="activity-title">
        <div class="sidebar-heading">
          <h2 id="activity-title" data-copy="activity"></h2>
          <button id="mobile-toggle" type="button" class="quiet mobile-toggle" aria-expanded="true" aria-controls="sidebar-body">−</button>
        </div>
        <div id="sidebar-body">
          <section class="settings">
            <label for="method" data-copy="method"></label>
            <select id="method" disabled><option>Umm al-Qura</option></select>
            <div id="notice" class="notice" role="status" hidden><span id="notice-text"></span><button id="retry" type="button" data-copy="retry"></button></div>
          </section>
          <section class="legend-section">
            <h3 data-copy="legend"></h3>
            <ul id="legend" class="legend"></ul>
          </section>
          <section id="selection" class="selection" hidden></section>
          <section class="activity-block">
            <div class="section-heading"><h3 data-copy="recent"></h3><span class="window-label" data-copy="recentWindow"></span></div>
            <div id="activity-list" class="activity-list"></div>
          </section>
          <footer class="sidebar-footer">
            <details><summary data-copy="about"></summary><p data-copy="aboutText"></p></details>
            <a href="https://albalagh.net/general/the-sound-of-azaan-constantly-echoes-around-the-globe" target="_blank" rel="noopener noreferrer" data-copy="source"></a>
          </footer>
        </div>
      </aside>
    </main>`
}

export class Sidebar {
  private listSignature = ''
  private selectionSignature = ''
  constructor(private cities: Map<number, City>, private pick: (event: PrayerEvent) => void, private close: () => void) {}

  invalidate() { this.listSignature = ''; this.selectionSignature = '' }

  legend(locale: Locale) {
    element('legend').replaceChildren(...prayers.map(prayer => {
      const item = document.createElement('li')
      const dot = document.createElement('i')
      dot.style.setProperty('--prayer', colors[prayer])
      item.append(dot, messages[locale][prayer])
      return item
    }))
  }

  recent(events: PrayerEvent[], locale: Locale, selected: PrayerEvent | null) {
    const visible = events.toReversed()
    const signature = JSON.stringify([locale, selected && eventKey(selected), ...visible.map(eventKey)])
    if (signature === this.listSignature) return
    this.listSignature = signature
    const list = element('activity-list')
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.eventId : undefined
    const rows = visible.flatMap(event => {
      const city = this.cities.get(event.cityId)
      if (!city) return []
      const row = document.createElement('button')
      row.className = 'activity-row'
      row.type = 'button'
      row.dataset.eventId = eventKey(event)
      row.setAttribute('aria-pressed', String(eventKey(event) === (selected && eventKey(selected))))
      row.style.setProperty('--prayer', colors[event.prayer])
      const label = document.createElement('span')
      const kind = document.createElement('small')
      kind.textContent = messages[locale][event.prayer]
      label.append(placeLabel(city, locale), kind)
      const time = document.createElement('time')
      time.dateTime = new Date(event.at).toISOString()
      time.textContent = formatTime(event.at, city.zone, locale)
      row.append(label, time)
      row.addEventListener('click', () => this.pick(event))
      return [row]
    })
    if (!rows.length) {
      const empty = document.createElement('p')
      empty.className = 'empty'
      empty.textContent = messages[locale].empty
      list.replaceChildren(empty)
    } else {
      list.replaceChildren(...rows)
      if (focused) (rows.find(row => row.dataset.eventId === focused) ?? rows[0]).focus({ preventScroll: true })
    }
  }

  details(event: PrayerEvent | null, method: string, locale: Locale, fallbackCity?: number) {
    const signature = JSON.stringify([event && eventKey(event), method, locale, fallbackCity])
    if (signature === this.selectionSignature) return
    this.selectionSignature = signature
    const pane = element('selection')
    const city = this.cities.get(event?.cityId ?? fallbackCity ?? -1)
    pane.hidden = !city
    if (!city) return
    const title = document.createElement('h3')
    title.textContent = messages[locale].details
    const button = document.createElement('button')
    button.className = 'close-detail'
    button.type = 'button'
    button.textContent = '×'
    button.setAttribute('aria-label', messages[locale].close)
    button.onclick = this.close
    const name = placeLabel(city, locale)
    const info = document.createElement('p')
    info.textContent = event ? `${messages[locale][event.prayer]} · ${formatTime(event.at, city.zone, locale, true)}` : city.zone
    const source = document.createElement('small')
    source.textContent = `${messages[locale].schedule} · ${methodName(method, locale)}`
    pane.replaceChildren(title, button, name, info, source)
    if (event?.polar) {
      const note = document.createElement('p')
      note.textContent = messages[locale].estimated
      pane.append(note)
    }
  }
}
