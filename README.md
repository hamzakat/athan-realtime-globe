# Athan Realtime Globe

Watch the previous 24 hours of calculated prayer starts, then keep the globe open for live Athan events. Drag to rotate, use the wheel or pinch to zoom, and select a city for its local time. The calculation method applies worldwide and defaults to Umm al-Qura.

## Run locally

```sh
nvm install
nvm use
npm ci
npm run dev
```

Open the local URL printed by Vite. For a production preview and verification, run:

```sh
npm test
npm run coverage:seasons
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

The build generates five UTC days of schedules for each supported Adhan method. The GitHub Actions workflow regenerates daily and publishes a complete static artifact. In the GitHub repository’s **Settings → Pages**, choose **GitHub Actions** as the publishing source. The workflow runs from `main` and supports project subpaths.

## Data

- [Adhan JS](https://github.com/batoulapps/adhan-js) calculates prayer starts. A city may follow a different local timetable. Umm al-Qura uses an extra 30 minutes for Isha on Ramadan evenings according to the calculated Umm al-Qura calendar. Near the poles the generator can use the nearest latitude where the required solar events are available.
- [GeoNames](https://www.geonames.org/export/) provides the city catalog under CC BY. Catalog selection prioritizes capitals and geographic coverage. It excludes city subdivisions, abandoned places and historical entries. City labels use the GeoNames name.
- [Natural Earth](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2) supplies public-domain 1:50 million land, coastline and country boundary layers. The boundary layer follows its de facto convention.

The app ships the processed map layers. To regenerate them from the source snapshots, pass a directory with the following files to `npm run geography -- /path/to/source-files`. The script verifies embedded SHA-256 hashes. GeoNames publishes a changing extract, so retain the dated raw archive when regenerating the same snapshot.

| Filename | Source |
| --- | --- |
| `cities5000.zip` | [GeoNames cities5000 snapshot](https://download.geonames.org/export/dump/cities5000.zip), retrieved 2026-11-26 |
| `land.json` | [Natural Earth land at v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_land.geojson) |
| `coastline.json` | [Natural Earth coastlines at v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_coastline.geojson) |
| `borders.json` | [Natural Earth international land borders at v5.1.2](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_boundary_lines_land.geojson) |
