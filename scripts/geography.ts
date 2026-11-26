import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { City } from '../src/model.ts'

type Candidate = City & { population: number, capital: boolean }
type Point = [number, number]
type Feature<T> = { geometry: { type: string, coordinates: T } | null }
type Collection<T> = { features: Feature<T>[] }

const zones = new Map<string, boolean>()
const excludedPlaces = new Set(['PPLX', 'PPLQ', 'PPLH', 'PPLW', 'PPLCH', 'PPLS'])
export function parseCity(row: string): Candidate | null {
  const [id, name, , , latitude, longitude, , code, country, , , , , , population, , , zone] = row.split('\t')
  if (!zone || !name || !id || !latitude || !longitude || excludedPlaces.has(code)) return null
  if (!zones.has(zone)) {
    try { new Intl.DateTimeFormat('en', { timeZone: zone }); zones.set(zone, true) }
    catch { zones.set(zone, false) }
  }
  const lat = Number(latitude)
  const lon = Number(longitude)
  if (!zones.get(zone) || !Number.isSafeInteger(Number(id)) || Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 || !Number.isFinite(lat + lon)) return null
  return { id: Number(id), name, lat, lon, zone, country, population: Number(population) || 0, capital: code === 'PPLC' }
}

export function selectCities(input: Candidate[], limit: number): City[] {
  const chosen = new Map<number, Candidate>()
  const cells = new Map<string, Candidate[]>()
  for (const city of [...input].sort((a, b) => b.population - a.population || a.id - b.id)) {
    if (city.capital && chosen.size < limit) chosen.set(city.id, city)
    if (city.capital) continue
    const key = `${Math.floor(city.lat / 4)}/${Math.floor(city.lon / 4)}`
    const cell = cells.get(key) ?? []
    cell.push(city)
    cells.set(key, cell)
  }
  for (let rank = 0; chosen.size < limit; rank++) {
    let found = false
    for (const cell of cells.values()) {
      const city = cell[rank]
      if (!city) continue
      found = true
      chosen.set(city.id, city)
      if (chosen.size === limit) break
    }
    if (!found) break
  }
  return [...chosen.values()].sort((a, b) => a.id - b.id).map(({ id, name, lat, lon, zone, country }) =>
    ({ id, name, lat, lon, zone, country }))
}

export function compactLines(lines: Point[][]): Point[][] {
  return lines.map(line => line.map(([lon, lat]) =>
    [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000]))
}

function inside(lon: number, lat: number, ring: Point[]): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[j]
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (x2 - x1) * (lat - y1) / (y2 - y1)) hit = !hit
  }
  return hit
}

function landDots(polygons: Point[][][]): Point[] {
  const bounded = polygons.map(([outer, ...holes]) => {
    const min: Point = [180, 90]
    const max: Point = [-180, -90]
    for (const [lon, lat] of outer) {
      min[0] = Math.min(min[0], lon)
      min[1] = Math.min(min[1], lat)
      max[0] = Math.max(max[0], lon)
      max[1] = Math.max(max[1], lat)
    }
    return { outer, holes, min, max }
  })
  const points: Point[] = []
  for (let row = 0; row < 180; row++) {
    const lat = row - 89.5
    const columns = Math.max(1, Math.round(360 * Math.cos(lat * Math.PI / 180)))
    for (let column = 0; column < columns; column++) {
      const lon = -180 + (column + (row % 2 ? 0.25 : 0.75)) * 360 / columns
      if (bounded.some(({outer, holes, min, max}) => lon >= min[0] && lon <= max[0] &&
        lat >= min[1] && lat <= max[1] && inside(lon, lat, outer) && !holes.some(r => inside(lon, lat, r))))
        points.push([lon, lat])
    }
  }
  return compactLines([points])[0]
}

const inputs = {
  'coastline.json': '271f1c4c1908312bac6b29d158ea1356544beafc129f260005300913aa5ea283',
  'land.json': 'e874b27a51d146452be360cafb3cc50c86001074a67d534113e6534682f9826b',
  'borders.json': '2faac4f6b34386f3d21b6e018cf151f241f00e5c936d44dd17d7d9bfb147fa48',
  'cities5000.zip': '8fc499f24d383f1f8317975cb627dedc167a1290f5be92040f810058ab6fabfe',
}
function build(input: string, out: string) {
  for (const [file, hash] of Object.entries(inputs)) {
    if (createHash('sha256').update(readFileSync(join(input, file))).digest('hex') !== hash)
      throw new Error(`Source checksum mismatch for ${file}`)
  }
  const rows = execFileSync('unzip', ['-p', join(input, 'cities5000.zip'), 'cities5000.txt'],
    { encoding: 'utf8', maxBuffer: 50_000_000 }).split('\n').map(parseCity).filter(c => c !== null)
  const land: Collection<Point[][] | Point[][][]> = JSON.parse(readFileSync(join(input, 'land.json'), 'utf8'))
  const linesFrom = (file: string) => {
    const layer: Collection<Point[] | Point[][]> = JSON.parse(readFileSync(join(input, file), 'utf8'))
    return compactLines(layer.features.flatMap(({geometry: g}) => !g ? [] :
      g.type === 'MultiLineString' ? g.coordinates as Point[][] : [g.coordinates as Point[]]))
  }
  const polygons = land.features.flatMap(({geometry: g}) => !g ? [] :
    g.type === 'MultiPolygon' ? g.coordinates as Point[][][] : [g.coordinates as Point[][]])
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'cities.json'), JSON.stringify(selectCities(rows, 3000)))
  writeFileSync(join(out, 'earth.json'), JSON.stringify({ dots: landDots(polygons), borders: linesFrom('borders.json'), coasts: linesFrom('coastline.json') }))
  writeFileSync(join(out, 'sources.json'), JSON.stringify({ naturalEarth: 'v5.1.2, 1:50m Land, Coastline and Admin 0 land boundary lines', geoNames: 'cities5000 download 2026-11-26', sha256: inputs }, null, 2))
}

if (import.meta.main)
  build(process.argv[2] ?? 'geography-inputs', process.argv[3] ?? 'public/data/geography')
