import {
  BufferGeometry, Color, Float32BufferAttribute, LineBasicMaterial, LineSegments,
  Mesh, PerspectiveCamera, Points, Scene, ShaderMaterial, SphereGeometry, Vector3, WebGLRenderer,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { eventKey, type City, type PrayerEvent } from './model.ts'
import { colors, markerStrength } from './markers.ts'
import type { Frame } from './timeline.ts'

type Point = [number, number]
export type Earth = { dots: Point[], coasts: Point[][], borders: Point[][] }
type Visible = { x: number, y: number, event: PrayerEvent, opacity: number, radius: number, flash: number }

const RADIUS = 1
const BASE_DISTANCE = 4.45
const radians = Math.PI / 180
export function positionOnGlobe(lon: number, lat: number, radius = RADIUS) {
  const phi = lat * radians
  const lambda = lon * radians
  return new Vector3(
    radius * Math.cos(phi) * Math.sin(lambda),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(lambda),
  )
}

function lines(paths: Point[][], color: number, opacity: number) {
  const positions: number[] = []
  for (const path of paths) {
    for (let i = 1; i < path.length; i++) {
      const [lon, lat] = path[i - 1]
      const [nextLon, nextLat] = path[i]
      // Short subdivisions follow the sphere and keep long segments above its surface.
      const delta = ((nextLon - lon + 540) % 360) - 180
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(delta), Math.abs(nextLat - lat)) / 1.5))
      for (let step = 0; step < steps; step++) {
        for (const k of [step, step + 1]) {
          const position = positionOnGlobe(lon + delta * k / steps, lat + (nextLat - lat) * k / steps, 1.002)
          positions.push(position.x, position.y, position.z)
        }
      }
    }
  }
  return new LineSegments(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(positions, 3)),
    new LineBasicMaterial({color, transparent: true, opacity}))
}

export class Globe {
  private renderer: WebGLRenderer
  private scene = new Scene()
  private camera = new PerspectiveCamera(32, 1, 0.01, 100)
  private controls: OrbitControls
  private overlay = document.createElement('canvas')
  private context: CanvasRenderingContext2D
  private positions: Map<number, Vector3>
  private pulses = new Map<string, { event: PrayerEvent, started: number }>()
  private visible: Visible[] = []
  private width = 1
  private height = 1
  private ratio = 1
  private dirty = true
  private previous = 0
  private manuallyMoved = false
  private pointerDown: Point | null = null
  private lastHovered: string | undefined
  private hoverPointer: Point | null = null
  private projected = new Vector3()

  constructor(private host: HTMLElement, earth: Earth, cities: City[],
    private onPick: (event: PrayerEvent) => void, private onHover: (event: PrayerEvent | null, point?: Point) => void) {
    const context = this.overlay.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    this.context = context
    this.renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.domElement.className = 'globe-surface'
    this.overlay.className = 'globe-overlay'
    this.overlay.setAttribute('aria-hidden', 'true')
    this.positions = new Map(cities.map(city => [city.id, positionOnGlobe(city.lon, city.lat, 1.006)]))
    this.scene.add(new Mesh(new SphereGeometry(1, 128, 96), new ShaderMaterial({
      vertexShader: `
        varying vec3 normalView;
        void main() {
          normalView = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying vec3 normalView;
        void main() {
          vec3 n = normalize(normalView);
          float light = max(0.0, dot(n, normalize(vec3(-.36, .68, .77))));
          float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 4.0);
          vec3 ocean = mix(vec3(.023, .070, .072), vec3(.055, .161, .149), light);
          gl_FragColor = vec4(ocean + rim * vec3(.105, .29, .227), 1.0);
        }`,
    })))
    this.scene.add(lines(earth.coasts, 0x5a9783, 0.54), lines(earth.borders, 0x92b8a0, 0.69))
    this.scene.add(new Points(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(
      earth.dots.flatMap(([lon, lat]) => positionOnGlobe(lon, lat, 1.003).toArray()), 3)),
    new ShaderMaterial({
      transparent: true,
      uniforms: { tint: { value: new Color('#9cd8b0') }, dpr: {value: Math.min(devicePixelRatio, 2)} },
      vertexShader: `
        uniform float dpr;
        void main() {
          vec4 local = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * local;
          gl_PointSize = dpr * clamp(6.0 / -local.z, 1.0, 4.2);
        }`,
      fragmentShader: `
        uniform vec3 tint;
        void main() {
          float opacity = 1.0 - smoothstep(.20, .5, length(gl_PointCoord - .5));
          if (opacity < .05) discard;
          gl_FragColor = vec4(tint, opacity * .64);
        }`,
    })))
    host.append(this.renderer.domElement, this.overlay)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enablePan = false
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.09
    this.controls.minDistance = 1.24
    this.controls.maxDistance = 7.4
    this.controls.autoRotateSpeed = 4
    this.controls.addEventListener('change', () => { this.dirty = true })
    this.controls.addEventListener('start', () => this.stopAuto())
    this.reset()
    const canvas = this.renderer.domElement
    canvas.addEventListener('pointerdown', e => { this.pointerDown = [e.clientX, e.clientY] })
    canvas.addEventListener('pointerup', e => {
      if (!this.pointerDown || !e.isPrimary || Math.hypot(e.clientX - this.pointerDown[0], e.clientY - this.pointerDown[1]) > 7) return
      const event = this.hit(e.clientX, e.clientY)
      if (event) this.onPick(event)
    })
    canvas.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || e.buttons) return
      this.hoverPointer = [e.clientX, e.clientY]
      this.lastHovered = undefined
      this.updateHover()
    })
    const dismissHover = () => {
      this.hoverPointer = null
      this.lastHovered = undefined
      this.onHover(null)
    }
    canvas.addEventListener('pointerleave', dismissHover)
    canvas.addEventListener('pointerdown', dismissHover)
    new ResizeObserver(() => this.resize()).observe(host)
    this.resize()
  }
  private resize() {
    this.width = Math.max(this.host.clientWidth, 1)
    this.height = Math.max(this.host.clientHeight, 1)
    this.ratio = Math.min(devicePixelRatio, 2)
    this.camera.aspect = this.width / this.height
    this.camera.fov = this.camera.aspect < 1 ? 32 / this.camera.aspect : 32
    this.camera.updateProjectionMatrix()
    const distance = this.camera.position.length()
    this.controls.maxDistance = this.camera.aspect < 0.85 ? 8 : 7.4
    if (distance === 0) this.reset()
    this.renderer.setPixelRatio(this.ratio)
    this.renderer.setSize(this.width, this.height)
    this.overlay.width = Math.round(this.width * this.ratio)
    this.overlay.height = Math.round(this.height * this.ratio)
    this.context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0)
    this.dirty = true
  }
  reset() {
    this.stopAuto()
    this.camera.position.copy(positionOnGlobe(37, 24, BASE_DISTANCE))
    this.controls.update()
  }
  beginReplay() { this.manuallyMoved = false }
  clear() { this.pulses.clear() }
  zoom(inward: boolean) {
    this.stopAuto()
    const distance = this.camera.position.length() * (inward ? 0.78 : 1 / 0.78)
    this.camera.position.setLength(Math.min(this.controls.maxDistance, Math.max(this.controls.minDistance, distance)))
    this.controls.update()
  }
  private stopAuto() { this.manuallyMoved = true; this.controls.autoRotate = false }
  setCities(cities: City[]) {
    this.positions = new Map(cities.map(city => [city.id, positionOnGlobe(city.lon, city.lat, 1.006)]))
    this.clear()
  }
  private updateHover() {
    if (!this.hoverPointer) return
    const [x, y] = this.hoverPointer
    const event = this.hit(x, y)
    const key = event && eventKey(event)
    if (key === this.lastHovered) return
    this.lastHovered = key
    const box = this.host.getBoundingClientRect()
    this.onHover(event ?? null, [x - box.left, y - box.top])
  }
  private hit(clientX: number, clientY: number) {
    const box = this.host.getBoundingClientRect()
    const x = clientX - box.left
    const y = clientY - box.top
    let best: Visible | undefined
    let distance = 14
    for (const marker of this.visible) {
      const d = Math.hypot(marker.x - x, marker.y - y)
      if (d < distance) { best = marker; distance = d }
    }
    return best?.event
  }
  draw(frame: Frame, now: number, reduced: boolean, selected: PrayerEvent | null) {
    const replay = frame.mode === 'replay' || frame.mode === 'paused'
    this.controls.autoRotate = frame.mode === 'replay' && !reduced && !this.manuallyMoved
    this.controls.update(Math.min(0.05, Math.max(0, (now - this.previous) / 1000)))
    this.previous = now
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera)
      this.dirty = false
    }
    if (!reduced) for (const event of frame.arrivals) this.pulses.set(eventKey(event), { event, started: now })
    const decay = replay ? 520 : 1150
    for (const [key, pulse] of this.pulses) if (now - pulse.started >= decay) this.pulses.delete(key)

    const grouped = new Map<string, Visible>()
    const cell = this.camera.position.length() > 3.2 ? 8 : 3
    const collect = (event: PrayerEvent, opacity: number, radius: number, flash: number) => {
      const point = this.positions.get(event.cityId)
      if (!point || point.dot(this.camera.position) <= 1.014) return
      const projected = this.projected.copy(point).project(this.camera)
      if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) return
      const x = (projected.x + 1) * this.width / 2
      const y = (1 - projected.y) * this.height / 2
      const key = `${event.prayer}/${Math.floor(x / cell)}/${Math.floor(y / cell)}`
      if ((grouped.get(key)?.opacity ?? -1) < opacity)
        grouped.set(key, { x, y, event, opacity, radius, flash })
    }
    for (const event of frame.recent) {
      const strength = markerStrength(event, frame.at, undefined, now, reduced).recent
      collect(event, 0.35 + 0.46 * strength, 1.8 + strength, 0)
    }
    for (const { event, started } of this.pulses.values()) {
      const strength = markerStrength(event, frame.at, started, now, reduced, decay).flash
      collect(event, 0.36 + 0.64 * strength, 1.5 + strength * (replay ? 2 : 3.7), strength)
    }
    if (selected) collect(selected, 1.1, 4.9, 0.6)
    this.visible = [...grouped.values()].sort((a, b) => a.opacity - b.opacity)
    const ctx = this.context
    ctx.clearRect(0, 0, this.width, this.height)
    for (const {x, y, radius, opacity, event, flash} of this.visible) {
      ctx.fillStyle = colors[event.prayer]
      if (flash > .12) {
        ctx.globalAlpha = Math.min(.24, flash * .24)
        ctx.beginPath()
        ctx.arc(x, y, radius * 2.3, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = Math.min(opacity, 1)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    this.updateHover()
  }
}
