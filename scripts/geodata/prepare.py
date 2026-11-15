"""Prepare a bounded, auditable DEM outside request handlers. No synthetic fallback."""
import argparse, hashlib, json, math
from pathlib import Path
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from rasterio.enums import Resampling

REGIONS = {'mars': (-121.10, -6.43, -120.86, -6.19), 'khermen': (99.79337,43.43442,99.87337,43.51442), 'tsagaan': (105.68226,44.54187,105.75226,44.61187)}

def prepare(args):
    # Rasterio/GDAL reads georeferencing and PDS label encoding. Require topography,
    # not radius, and explicitly assert units/datum from the source metadata.
    if args.region == 'mars' and args.product != 'MOLA_TOPOGRAPHY':
        raise ValueError('Mars input must be identified as MOLA_TOPOGRAPHY, never radius or rendered imagery')
    if args.region != 'mars' and args.product != 'COPERNICUS_DEM':
        raise ValueError('Earth input must be identified as COPERNICUS_DEM')
    with rasterio.open(args.input) as src:
        if src.count != 1 or src.dtypes[0] not in ('int16','int32','float32','float64'):
            raise ValueError('Expected single-band numerical elevation, not RGB or an unsigned rendered image')
        if src.crs is None or not src.crs.is_geographic:
            raise ValueError('Input must have a geographic CRS; reproject with GDAL first')
        bounds = list(REGIONS[args.region])
        if args.region == 'mars' and src.bounds.left >= 0:
            bounds[0] += 360; bounds[2] += 360
        if not (src.bounds.left <= bounds[0] < bounds[2] <= src.bounds.right and src.bounds.bottom <= bounds[1] < bounds[3] <= src.bounds.top):
            raise ValueError('Selected region is outside input raster coverage')
        window = from_bounds(*bounds, transform=src.transform)
        # Never upsample a coarse product and imply increased measurement resolution.
        width = min(args.size, max(2,int(window.width)))
        height = min(args.size, max(2,int(window.height)))
        arr = src.read(1, window=window, out_shape=(height,width), masked=True, resampling=Resampling.average).astype(float)
        arr = arr * src.scales[0] + src.offsets[0]
        arr = arr.filled(np.nan)
        transform=src.window_transform(window)*src.transform.scale(window.width/width,window.height/height)
        west,north=transform*(.5,.5); east,south=transform*(width-.5,height-.5)
        if west>180: west-=360;east-=360
        native_res=list(src.res)
        crs=src.crs.to_wkt()
    radius=3389500 if args.region=='mars' else 6371008.8
    dx=math.radians((east-west)/(width-1))*radius*math.cos(math.radians((north+south)/2))
    dy=math.radians((north-south)/(height-1))*radius
    gy,gx=np.gradient(arr,dy,dx)
    slope=np.degrees(np.arctan(np.hypot(gx,gy)))
    aspect=np.arctan2(-gx,gy)
    hillshade=np.clip(np.cos(np.pi/4)*np.cos(np.radians(slope))+np.sin(np.pi/4)*np.sin(np.radians(slope))*np.cos(math.radians(315)-aspect),0,1)
    clean=lambda a:[None if not np.isfinite(v) else round(float(v),3) for v in a.ravel()]
    checksum=hashlib.sha256()
    with open(args.input,'rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):checksum.update(chunk)
    data={'width':width,'height':height,'bounds':[west,south,east,north],'body':'mars' if args.region=='mars' else 'earth','classification':'derived','source':args.source_url,'resolution':f'Native {native_res} degrees; averaged to {width}×{height}','datum':args.datum,'values':clean(arr),'slopes':clean(slope),'hillshade':clean(hillshade),'metadata':{'product':args.product,'units':'metres','sourceCRS':crs,'inputSHA256':checksum.hexdigest(),'license':args.license,'processing':'Rasterio average resampling; pixel centers; original NoData retained; no upsampling','limitations':'Resolution does not resolve small obstacles. Not validated for navigation.'}}
    output=Path(args.output or f'public/geodata/{args.region}.json');output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(data,separators=(',',':'),allow_nan=False))
    print(f'Wrote {output}: {width}×{height}, {np.isfinite(arr).sum()} valid cells')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--region',choices=REGIONS,required=True);p.add_argument('--input',required=True,help='Local georeferenced raster or PDS label with adjacent image')
    p.add_argument('--product',choices=['MOLA_TOPOGRAPHY','COPERNICUS_DEM'],required=True)
    p.add_argument('--source-url',required=True);p.add_argument('--datum',required=True);p.add_argument('--license',required=True)
    p.add_argument('--size',type=int,default=129);p.add_argument('--output')
    args=p.parse_args()
    if not 3<=args.size<=256:p.error('--size must be 3–256')
    prepare(args)
