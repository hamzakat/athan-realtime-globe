import { DAY, RECENT, REPLAY_MS, type PrayerEvent } from './model.ts'

export type Frame = { mode: 'replay' | 'paused' | 'live' | 'expired', at: number, arrivals: PrayerEvent[], recent: PrayerEvent[] }
function after(events: PrayerEvent[], at: number): number {
  let low = 0
  let high = events.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (events[mid].at <= at) low = mid + 1
    else high = mid
  }
  return low
}

export class Timeline {
  private cursor: number
  private start: number
  private started: number
  private pausedAt: number | null = null
  private live: boolean
  constructor(now: number, monotonic: number, live: boolean) {
    this.start = now - DAY
    this.started = monotonic
    this.cursor = live ? now : this.start
    this.live = live
  }
  get isLive() { return this.live }
  get isPaused() { return this.pausedAt !== null }

  pause(monotonic: number) {
    if (!this.live && this.pausedAt === null) this.pausedAt = monotonic
  }
  play(monotonic: number) {
    if (this.pausedAt === null) return
    this.started += monotonic - this.pausedAt
    this.pausedAt = null
  }
  replay(endingAt: number, monotonic: number) {
    this.start = endingAt - DAY
    this.started = monotonic
    this.cursor = this.start
    this.live = false
    this.pausedAt = null
  }
  skip(now: number, events: PrayerEvent[]) {
    this.live = true
    this.pausedAt = null
    return this.reset(now, events)
  }
  reset(at: number, events: PrayerEvent[]): Frame {
    this.cursor = at
    return this.frame(at, this.live ? 'live' : this.isPaused ? 'paused' : 'replay', events, at)
  }
  tick(now: number, monotonic: number, events: PrayerEvent[], end = Infinity, start = -Infinity, synchronize = false): Frame {
    const elapsed = (this.pausedAt ?? monotonic) - this.started
    const finishesReplay = !this.live && elapsed >= REPLAY_MS
    if (finishesReplay) this.live = true
    const at = this.live ? now : this.start + Math.max(0, elapsed) / REPLAY_MS * DAY
    const available = at >= start && at < end
    const visibleAt = Math.min(at, end - 1)
    const from = synchronize && this.live ? visibleAt : this.cursor
    this.cursor = visibleAt
    const mode = !available ? 'expired' : this.live ? 'live' : this.isPaused ? 'paused' : 'replay'
    const arrivalEnd = finishesReplay && !synchronize ? Math.min(visibleAt, this.start + DAY) : visibleAt
    return this.frame(visibleAt, mode, events, from, arrivalEnd)
  }
  private frame(at: number, mode: Frame['mode'], events: PrayerEvent[], from: number, arrivalEnd = at): Frame {
    const end = after(events, at)
    return {
      at, mode,
      arrivals: events.slice(after(events, from), after(events, arrivalEnd)),
      recent: events.slice(after(events, at - RECENT), end),
    }
  }
}
