"""Pipeline integration test. Synthetic fixture only; no scientific asset is generated."""
import tempfile, subprocess, json, unittest
from pathlib import Path
import numpy as np
import rasterio
from rasterio.transform import from_bounds
from prepare import REGIONS

class PreprocessingTest(unittest.TestCase):
    def test_crop_nodata_and_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            source=Path(tmp)/'fixture.tif';output=Path(tmp)/'fixture.json'
            with rasterio.open(source,'w',driver='GTiff',height=65,width=65,count=1,dtype='int16',crs='EPSG:4326',transform=from_bounds(*REGIONS['khermen'],65,65),nodata=-32768) as ds:
                grid=np.arange(65*65,dtype='int16').reshape(65,65)
                grid[20:30,20:30]=-32768
                ds.write(grid,1)
            subprocess.run([__import__('sys').executable,str(Path(__file__).with_name('prepare.py')),'--region','khermen','--input',str(source),'--product','COPERNICUS_DEM','--source-url','TEST FIXTURE NOT SCIENCE','--datum','TEST','--license','TEST','--output',str(output)],check=True)
            data=json.loads(output.read_text())
            self.assertLessEqual(data['width'],65)
            self.assertIn(None,data['values'])
            self.assertEqual(len(data['slopes']),len(data['values']))
            self.assertEqual(data['metadata']['units'],'metres')
            self.assertEqual(len(data['metadata']['inputSHA256']),64)
            self.assertLess(data['bounds'][0],data['bounds'][2])
if __name__=='__main__':unittest.main()
