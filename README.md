# ӨРТӨӨ / URTUU — Martian Map Mission Control

**From the Mongolian Steppe to Mars.** An independent 2026 NASA Space Apps *Interplanetary Survival Guide: Martian Map* project. No NASA operation or endorsement is implied.

Өртөө takes inspiration from Mongolia’s historical relay infrastructure: hubs, sensors, radio relays and charging depots support a proposed exploration traverse. Khermen Tsav and Tsagaan Suvarga are geographic study regions for future Gobi analog exercises, not established bases or approved field sites.

## Current delivery status

The application runs and builds. It supports interactive planetary maps, manual routes, numeric-grid A*, station networks, energy calculations, deterministic playback, mission files and local 3D terrain. **The brief’s scientific-data acceptance criteria are not yet met.** The current cloud policy returned HTTP 403 for NASA Trek, NASA PDS and Copernicus. No genuine regional DEM or raster imagery was downloaded or bundled. NASA WMTS candidate identifiers, capabilities and real regional tile coverage remain unverified. USGS geology is a source reference, not a fabricated vector layer.

The application visibly reports missing data. A separately enabled **Synthetic laboratory** supplies reproducible generated terrain for demonstrations and tests. Its elevations are not measurements of Mars or Mongolia. It is never enabled automatically as a scientific-data fallback.

## Run

Node.js 22.9+ (validated with Node 24) and npm:

```sh
npm ci
npm run dev
```

The default port is 3000. No account, database, API key or runtime environment variable is required. `npm run build && npm start` serves production. `/api/health` returns application health.

### Demonstration without upstream services

1. Select Khermen Tsav or a Mars region.
2. Enable **Synthetic laboratory**. Its terrain classification remains visible.
3. Choose **Demo waypoints**, or choose **Add waypoint** and click the map. Drag markers to edit.
4. **Generate terrain route** runs A* on the numeric grid. **Use manual route** connects waypoints directly and remains unverified.
5. In **Network**, place individual nodes or **Auto Deploy Өртөө**; inspect links and disconnected nodes. A hub is needed for connectivity to mission control.
6. Play/pause, select playback speed, seek or reset. Battery consumption derives from route distance and positive elevation gain. Playback pauses at the configured reserve.
7. Trigger dust in **Safety**, inspect intersection warnings and reconsider the route or pause for delay.
8. Switch to **3D Terrain**, orbit/zoom, change exaggeration and fly along the route.
9. Save/load locally, export mission JSON or download a report. **Data & provenance** includes validated JSON import, route geometry export and reset.

## Architecture

- Next.js App Router / React / strict TypeScript; Tailwind and shadcn-style Radix Button; Lucide icons.
- Zustand holds mission state. Zod validates versioned mission files and bounded numeric assumptions.
- OpenLayers handles maps, providers, vector features, draggable waypoints, image overlays, coordinate inspection and body-aware scale.
- `lib/geo.ts`: planetary definitions, longitude normalization, spherical geodesics and interpolation. Mars radius **3,389.5 km**; Earth mean radius **6,371.0088 km**. Earth coordinates are WGS84-compatible; distances are a spherical approximation, not an ellipsoidal survey.
- `lib/routing.ts`: 8-connected A* with binary heap, geodesic edge distances, slope/gain cost, configured slope exclusions, NoData exclusion, no diagonal corner cutting and simulated hazard penalties. It snaps endpoints to cell centers. Hard slope limits are scenario assumptions, not official NASA limits.
- `lib/mission.ts`: station models, sampled route deployment, pairwise range/terrain/curvature LOS, hub connectivity, route-based energy, deterministic telemetry and serialization.
- `lib/hazards.ts`: shared deterministic dust geometry for rendering and routing, plus route-intersection warnings.
- Three.js generates a bounded mesh from numeric grids. Missing-data cells are omitted. The view currently uses elevation colors; imagery texture mapping is deferred.
- Python/Rasterio preprocesses scientific rasters offline. No large raster download or processing runs in a Vercel request.

## Scientific sources and licenses

| Source | Actual integration and status | Attribution / terms |
|---|---|---|
| [Cushing et al. 2007](https://doi.org/10.1029/2007GL030709) | Bundled published Annie, Dena and Chloë coordinates and reported elevations. Original east longitudes retained separately. | Published factual locations; study cited. Candidate skylights, not confirmed accessible cave entrances. |
| [NASA Mars Trek](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars) | Runtime capabilities adapter and candidate Viking optical, MOLA hillshade and THEMIS IR layer definitions. Network-blocked here; not verified live. | NASA / USGS / ASU as appropriate; verify each provider product’s terms and coverage before publication. |
| [NASA PDS MOLA MEGDR](https://pds-geosciences.wustl.edu/missions/mgs/megdr.html) | Offline numerical topography ingestion implemented; no product downloaded. | NASA MGS/MOLA/PDS, retain scientific metadata and source attribution. Rendered hillshade is never treated as elevation. |
| [Copernicus GLO-30](https://registry.opendata.aws/copernicus-dem/) | Fixed public tile downloader and regional crop pipeline for both Gobi regions; download blocked here. | Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018. Observe the Copernicus DEM license and attribution conditions. |
| [EOX Sentinel-2 cloudless](https://s2maps.eu) | WMS adapter, `s2cloudless-2020`; no live imagery validation in this environment. | Sentinel-2 cloudless by EOX IT Services GmbH, CC BY 4.0. |
| [USGS geologic map](https://www.usgs.gov/maps/geologic-map-mars) | Cited reference only; no polygon extraction. | Tanaka et al., USGS SIM 3292 (2014). |
| URTUU laboratory and telemetry | Deterministic synthetic demonstration data generated locally. | Repository MIT license; expressly not scientific observations. |

The source registry records organization, instrument, coverage, period, resolution, CRS, units, classification, attribution and availability. Product resolutions in candidate definitions must be verified against retrieved capabilities and manifests. Thermal images are intensity visualizations, not calibrated Kelvin temperatures.

## Prepare real regional terrain

```sh
python -m venv .venv
.venv/bin/pip install -r scripts/geodata/requirements.txt
.venv/bin/python scripts/geodata/fetch.py khermen /tmp/khermen.tif
.venv/bin/python scripts/geodata/prepare.py \
  --region khermen --input /tmp/khermen.tif --product COPERNICUS_DEM \
  --source-url https://registry.opendata.aws/copernicus-dem/ \
  --datum 'EGM2008 orthometric height, metres' \
  --license 'Copernicus DEM license; see registry and source attribution'
```

Repeat for `tsagaan` using its fixed source tile. Outputs go into `public/geodata/khermen.json` and `tsagaan.json` and are automatically loaded in the corresponding environment. Commit small prepared products and source/license metadata before deployment.

For Mars, obtain a **MOLA MEGDR topography** product and its PDS label from the official archive. Verify the label’s sample encoding, scale/offset, units, vertical datum and latitude convention. Keep `.LBL` and its referenced image together; open the label through GDAL/Rasterio. Radius products and color imagery are not topography. If necessary, convert with GDAL to a single-band, georeferenced geographic raster while preserving metre values and NoData. Then:

```sh
.venv/bin/python scripts/geodata/prepare.py \
  --region mars --input /path/to/topography.lbl --product MOLA_TOPOGRAPHY \
  --source-url 'https://pds-geosciences.wustl.edu/EXACT-PRODUCT-URL' \
  --datum 'MOLA areoid-referenced topography, metres' --license 'NASA PDS source terms'
```

The URL above is a placeholder to replace with the actual product URL; no product was verified during this blocked session. The pipeline accepts locally acquired assets, requires geographic georeferencing, rejects RGB/unsigned display rasters, refuses out-of-coverage regions, avoids upsampling, retains NoData, averages to at most 129×129 samples by default, computes slope/hillshade and writes pixel-center bounds plus input checksum and provenance. For a PDS label, the checksum covers the label; archive/checksum its referenced raster separately. The Earth downloader verifies TLS and refuses overwrites. Preserve provider checksums where supplied.

The Mars crop is a local Dena-region grid, not complete regional expedition coverage. Even valid MOLA samples are generally too coarse to establish astronaut-scale obstacle clearance. No terrain product certifies a safe route.

## Network requirements

Scientific requests need these hosts enabled: `trek.nasa.gov`, `pds-geosciences.wustl.edu`, `copernicus-dem-30m.s3.amazonaws.com`, `tiles.maps.eox.at`. The reference links also use `www.usgs.gov`, `astrogeology-usgs.hub.arcgis.com`, `doi.org`, and the dataset registry. Package installation needs npm and PyPI. Domain additions were saved in the cloud environment draft; that does not apply the running network policy or publish a snapshot.

The WMTS adapter reads actual matrix IDs, tile grids, style and formats from capabilities. It accepts known geographic CRSs and rejects unknown/projected conventions instead of assuming Earth XYZ. Provider matrix georeferencing is interpreted as advertised; physical distance and map scale remain Mars-specific. Other advertised planetary CRSs require a dedicated, validated adapter. All initial layer candidates remain pending live verification.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

Playwright uses system Chromium at `/usr/bin/chromium` when present; otherwise install it with `npx playwright install chromium`. Browser tests block upstream map requests and use explicitly synthetic local terrain, so they test functionality without claiming live data coverage. Unit tests cover target distances, unit correctness, terrain routing, NoData, obstacles, slope constraints, network connectivity, energy and mission validation. See `VALIDATION.md` for executed outcomes.

## Deploy to Vercel

Import this repository, select the Next.js framework preset, use `npm ci` and `npm run build`, and choose Node 22 or 24. No environment variables are required. No secrets belong in browser code. Mapping/WebGL load only on the client. Before public scientific demonstration, enable the scientific hosts, verify the candidate layers and tile coverage, prepare/licence the regional DEMs, commit the small derived files, rerun validation and then deploy. This session does not publish or deploy the application.

## Scientific and engineering limits / deferred features

- No validated real raster imagery or regional DEM is bundled yet; therefore three accessible Mars scientific raster categories and sourced 3D terrain remain external-data blockers.
- Automatic station deployment samples a route; it does not yet optimize terrain sites or add relays to repair gaps. Links show gaps honestly. LOS uses 63 terrain samples and curvature with no refraction/Fresnel/radio-budget model.
- Range circles are nominal reach, not measured reception. No beacon triangulation or navigation uncertainty estimator is implemented.
- Energy coefficients and radiation are user assumptions. No official suit consumable model, charging schedule, payload dynamics or weather observations. Charging depots have distinct modeled capacity/power but do not automatically recharge the rover.
- Local EVA return estimates assume retracing the outbound route; independent outbound/return optimization is deferred.
- Dust is a synthetic moving circle, with a soft routing cost and explicit intersection warning. A route can still intersect dust; delaying/sheltering remains a scenario decision, not a claim of safety.
- Roughness costs, USGS vector geology, calibrated thermal values, imagery-textured terrain and automatic camera follow during 2D playback are deferred.
- Regional Annie–Dena–Chloë geometry is a geodesic minimum. The hypothetical base is offset from Annie. The 425 km scenario is a separate assumption, never a computed safe route.
- Mars route exports carry explicit planetary metadata and use `.json`, since standard RFC 7946 GeoJSON assumes Earth. Earth route exports use `.geojson`.
- No account or cloud persistence. Mission JSON imports are schema-validated and size-limited; local browser storage may be unavailable.

This implementation addresses the challenge through explicit planetary context, scientific target provenance, auditable terrain planning, distributed relay modeling and reproducible Gobi analog exercises. The blocked scientific integrations must be completed before claiming the entire master brief’s definition of done.
