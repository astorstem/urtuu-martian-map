export type Source = {
  id: string;
  name: string;
  organization: string;
  url: string;
  instrument: string;
  type: string;
  coverage: string;
  resolution: string;
  period: string;
  crs: string;
  units: string;
  classification: string;
  attribution: string;
  availability: string;
  layer?: string;
};
const trek = "https://trek.nasa.gov/tiles/Mars/EQ/";
export const sources: Source[] = [
  {
    id: "optical",
    name: "Viking optical mosaic",
    organization: "NASA / USGS",
    url: "https://trek.nasa.gov/mars/",
    instrument: "Viking Orbiter",
    type: "WMTS raster",
    coverage: "Global; confirm provider capabilities",
    resolution: "232 m nominal product",
    period: "1976–1980 mission imagery",
    crs: "Provider-advertised Mars equirectangular",
    units: "Rendered intensity",
    classification: "measured imagery mosaic",
    attribution: "NASA / USGS / Mars Trek",
    availability: "Checked when enabled",
    layer: "Mars_Viking_MDIM21_ClrMosaic_global_232m",
  },
  {
    id: "hillshade",
    name: "MOLA color hillshade",
    organization: "NASA",
    url: "https://trek.nasa.gov/mars/",
    instrument: "Mars Global Surveyor MOLA",
    type: "WMTS raster",
    coverage: "Global",
    resolution: "463 m nominal",
    period: "1997–2001 MOLA observations",
    crs: "Provider-advertised Mars equirectangular",
    units: "Rendered color; not elevation samples",
    classification: "derived imagery",
    attribution: "NASA / MOLA / Mars Trek",
    availability: "Checked when enabled",
    layer: "Mars_MGS_MOLA_ClrShade_merge_global_463m",
  },
  {
    id: "thermal",
    name: "THEMIS day infrared",
    organization: "NASA / ASU",
    url: "https://trek.nasa.gov/mars/",
    instrument: "Mars Odyssey THEMIS",
    type: "WMTS raster",
    coverage: "Check capabilities and regional tiles",
    resolution: "100 m nominal mosaic",
    period: "Mars Odyssey mission; composite dates vary",
    crs: "Provider-advertised Mars equirectangular",
    units: "Rendered intensity, not Kelvin",
    classification: "derived thermal imagery",
    attribution: "NASA / JPL / ASU / Mars Trek",
    availability: "Checked when enabled",
    layer: "Mars_MO_THEMIS-IR-Day_mosaic_global_100m",
  },
  {
    id: "elevation",
    name: "Numerical elevation",
    organization: "NASA PDS / Copernicus",
    url: "https://pds-geosciences.wustl.edu/missions/mgs/megdr.html",
    instrument: "MOLA MEGDR / TanDEM-X",
    type: "Preprocessed numeric grid",
    coverage: "Only bundled regional bounds",
    resolution: "Native resolution preserved in manifest",
    period: "MOLA 1999–2001 / Copernicus 2011–2015",
    crs: "Mars planetocentric or Earth WGS84 geographic",
    units: "metres",
    classification: "derived elevation",
    attribution:
      "NASA MOLA; Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018",
    availability: "Requires regional preprocessing",
  },
  {
    id: "earth",
    name: "Sentinel-2 cloudless",
    organization: "EOX",
    url: "https://s2maps.eu",
    instrument: "Sentinel-2",
    type: "WMS imagery",
    coverage: "Earth land",
    resolution: "10 m source; display dependent",
    period: "2020 mosaic",
    crs: "EPSG:3857",
    units: "RGB",
    classification: "derived imagery",
    attribution:
      "Sentinel-2 cloudless — https://s2maps.eu by EOX IT Services GmbH (CC BY 4.0)",
    availability: "Checked when enabled",
  },
  {
    id: "geology",
    name: "USGS geologic map of Mars",
    organization: "USGS",
    url: "https://www.usgs.gov/maps/geologic-map-mars",
    instrument: "Published geological mapping",
    type: "Reference resource",
    coverage: "Global",
    resolution: "1:20,000,000",
    period: "2014 publication",
    crs: "Source-dependent",
    units: "Geological units",
    classification: "interpreted",
    attribution: "Tanaka et al., USGS SIM 3292",
    availability: "Unavailable: vector extraction not bundled",
  },
  {
    id: "targets",
    name: "Candidate skylights",
    organization: "Cushing et al.",
    url: "https://doi.org/10.1029/2007GL030709",
    instrument: "THEMIS",
    type: "Published points",
    coverage: "Arsia Mons",
    resolution: "Published coordinates to 0.01°",
    period: "2007 publication",
    crs: "Mars east longitude; normalized for map",
    units: "degrees / metres",
    classification: "published candidate interpretations",
    attribution: "Cushing et al. (2007), Geophysical Research Letters",
    availability: "Bundled coordinates",
  },
];
export function capabilitiesUrl(layer: string) {
  return `${trek}${layer}/1.0.0/WMTSCapabilities.xml`;
}
