"""Fetch source assets with TLS verification; never executed by the web app."""
import argparse, shutil, urllib.request
from pathlib import Path
URLS={
'khermen':'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N43_00_E099_00_DEM/Copernicus_DSM_COG_10_N43_00_E099_00_DEM.tif',
 'tsagaan':'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N44_00_E105_00_DEM/Copernicus_DSM_COG_10_N44_00_E105_00_DEM.tif'}
p=argparse.ArgumentParser(description=__doc__);p.add_argument('region',choices=URLS);p.add_argument('output');a=p.parse_args()
out=Path(a.output)
if out.exists():raise SystemExit('Refusing to overwrite existing file')
try:
    with urllib.request.urlopen(URLS[a.region],timeout=120) as response, out.open('wb') as f:shutil.copyfileobj(response,f)
except Exception:
    out.unlink(missing_ok=True);raise
print(out)
