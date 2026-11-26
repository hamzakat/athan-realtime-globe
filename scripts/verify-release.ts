import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DAY, DEFAULT_METHOD, prayers, utcDay, type City, type Manifest } from '../src/model.ts'
import { digest, methods } from './schedules.ts'

const directory = process.argv[2] ?? 'dist'
const index = readFileSync(join(directory, 'index.html'), 'utf8')
assert.match(index, /src="\.\/assets\//, 'Use relative app assets for GitHub project pages')
const bytes = readFileSync(join(directory, 'data/geography/cities.json'))
const cities = new Set((JSON.parse(bytes.toString()) as City[]).map(city => city.id))
assert.equal(cities.size, 3000)
const earth = JSON.parse(readFileSync(join(directory, 'data/geography/earth.json'), 'utf8'))
assert.ok(earth.borders.length > 100 && earth.coasts.length > 100 && earth.dots.length > 1000)
const folder = join(directory, 'data/schedules')
const manifest: Manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))
assert.equal(manifest.schema, 1)
assert.equal(manifest.catalog, digest(bytes))
assert.deepEqual(Object.keys(manifest.methods).sort(), [...methods].sort())
assert.ok(manifest.methods[DEFAULT_METHOD])
assert.equal(manifest.end - manifest.start, 5 * DAY)
assert.ok(Date.now() >= manifest.start && Date.now() < manifest.end)
let files = 0
for (const [method, days] of Object.entries(manifest.methods)) {
  assert.equal(Object.keys(days).length, 5, method)
  for (let at = manifest.start; at < manifest.end; at += DAY) {
    const file = days[utcDay(at)]
    assert.ok(file && !file.path.includes('/'), `${method} ${utcDay(at)}`)
    const contents = readFileSync(join(folder, file.path))
    assert.equal(file.hash, digest(contents), file.path)
    let previous = -1
    const unique = new Set<string>()
    for (const [offset, city, prayer, polar] of JSON.parse(contents.toString()) as number[][]) {
      assert.ok(Number.isInteger(offset) && offset >= previous && offset >= 0 && offset < DAY, file.path)
      assert.ok(cities.has(city) && prayers[prayer], file.path)
      assert.ok(polar === undefined || polar === 1, file.path)
      const id = `${offset}/${city}/${prayer}`
      assert.ok(!unique.has(id), id)
      unique.add(id)
      previous = offset
    }
    assert.ok(unique.size > cities.size, file.path)
    files++
  }
}
console.log(`Verified ${files} schedule files, their hashes, ${cities.size} cities, and relative deployment assets.`)
