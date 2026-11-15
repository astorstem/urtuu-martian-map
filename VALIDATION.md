# Validation record

Executed 2026-11-15 in the prepared cloud workspace (Node 24.22.1, Python 3.12.14, system Chromium).

| Check | Result |
|---|---|
| `npm run typecheck` | Passed, strict TypeScript |
| `npm run lint` | Passed, no errors or warnings |
| `npm test` | 16 tests passed in 2 files |
| `npm run test:e2e` | 3 tests passed in Chromium |
| `npm run build` | Passed; Next.js production application compiled and pages generated |
| `python scripts/geodata/test_prepare.py` in geodata virtualenv | 1 integration test passed; temporary synthetic raster, not a scientific asset |
| Local `/api/health` request | HTTP success; `status: ok` |
| NASA Trek capabilities request | Blocked: proxy HTTP 403 |
| NASA PDS MOLA archive request | Blocked: proxy HTTP 403 |
| Copernicus source tile request | Blocked: proxy HTTP 403 |

Browser coverage: Mars initial view, Gobi environment switch, explicit synthetic terrain, slope toggle, A* route, automatic stations and nominal coverage, play/pause, dust trigger, local save/load, JSON download, missing-DEM error state, 3D canvas, vertical exaggeration, route flyover, dialog keyboard exit. The 3D test also checks for unhandled page errors.

These tests establish the implemented local workflow. They do not validate upstream tile identifiers, scientific data coverage, real DEM terrain, field access, rover performance or route safety. See README for blocked/deferred requirements. The initial browser failures (accessible layer naming, hydration timing and development-overlay overlap) were corrected before the passing run.

No deployment, publication or fresh-task snapshot restoration was performed. Network additions are saved as a draft only.
