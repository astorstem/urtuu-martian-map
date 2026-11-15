# Regional terrain assets

No real numerical DEM is currently bundled. Run the documented preprocessing pipeline to produce `mars.json`, `khermen.json`, and `tsagaan.json` here. Each grid must carry source, resolution, datum, classification, bounds and numerical metre values with null NoData. Commit small derived assets with source attribution and applicable license metadata.

Synthetic laboratory grids are generated in `lib/terrain.ts` only after the user explicitly enables that mode; they are not scientific replacements for these files.
