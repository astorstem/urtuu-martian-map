"use client";
import { useEffect, useRef, useMemo } from "react";
import { dustHazard } from "@/lib/hazards";
import Map from "ol/Map";
import { ScaleLine, defaults as defaultControls } from "ol/control";
import View from "ol/View";
import Feature from "ol/Feature";
import { Point as OlPoint, LineString, Polygon } from "ol/geom";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import ImageLayer from "ol/layer/Image";
import ImageCanvasSource from "ol/source/ImageCanvas";
import VectorSource from "ol/source/Vector";
import WMTS, { optionsFromCapabilities } from "ol/source/WMTS";
import TileWMS from "ol/source/TileWMS";
import WMTSCapabilities from "ol/format/WMTSCapabilities";
import Projection from "ol/proj/Projection";
import {
  addProjection,
  fromLonLat,
  toLonLat,
  get as getProjection,
} from "ol/proj";
import { Style, Stroke, Fill, Circle, Text } from "ol/style";
import { Modify } from "ol/interaction";
import { useMission } from "@/stores/mission";
import { regions, targets, bodies, type Point } from "@/lib/geo";
import { makeStation, network, simulation } from "@/lib/mission";
import { sources, capabilitiesUrl } from "@/lib/sources";
import { slope } from "@/lib/terrain";
const mars = new Projection({
  code: "URTUU:MARS_EQ",
  units: "degrees",
  extent: [-180, -90, 180, 90],
  global: true,
  metersPerUnit: (2 * Math.PI * 3389500) / 360,
  getPointResolution: (resolution, point) =>
    resolution * Math.cos((point[1] * Math.PI) / 180),
});
addProjection(mars);
export default function MissionMap({ opacity }: { opacity: number }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const vectors = useRef(new VectorSource());
  const rasterRef = useRef<TileLayer[]>([]);
  const overlayRef = useRef<ImageLayer<ImageCanvasSource> | null>(null);
  const state = useMission();
  const { mission, grid } = state;
  const region = regions[mission.region];
  const net = useMemo(
    () => network(mission.stations, region.body, grid),
    [mission.stations, region.body, grid],
  );
  useEffect(() => {
    if (!host.current) return;
    const source = vectors.current;
    const earth = region.body === "earth";
    const proj = earth ? "EPSG:3857" : mars;
    const project = (p: Point) => (earth ? fromLonLat(p) : p);
    const unproject = (p: number[]): Point =>
      (earth ? toLonLat(p) : p) as Point;
    const vector = new VectorLayer({
      source,
      style: (feature) => {
        const kind = feature.get("kind"),
          label = feature.get("label");
        const color =
          kind === "hazard"
            ? "#d9674b"
            : kind === "route"
              ? "#f8a66b"
              : kind === "link"
                ? feature.get("clear")
                  ? "#80bd9e"
                  : "#bd8067"
                : kind === "rover"
                  ? "#ecf5dc"
                  : "#9ecbd0";
        return new Style({
          stroke: new Stroke({
            color,
            width: kind === "route" ? 3 : 1.5,
            lineDash: kind === "link" ? [5, 6] : undefined,
          }),
          fill: new Fill({
            color:
              kind === "hazard"
                ? "rgba(220,90,55,.17)"
                : "rgba(100,180,180,.055)",
          }),
          image: new Circle({
            radius: kind === "rover" ? 7 : kind === "waypoint" ? 5 : 7,
            fill: new Fill({ color }),
            stroke: new Stroke({ color: "#101c20", width: 2 }),
          }),
          text: label
            ? new Text({
                text: label,
                offsetY: -20,
                font: "11px monospace",
                fill: new Fill({ color: "#e6e9df" }),
                stroke: new Stroke({ color: "#142125", width: 4 }),
              })
            : undefined,
        });
      },
    });
    const map = new Map({
      target: host.current,
      controls: defaultControls().extend([new ScaleLine({ units: "metric" })]),
      layers: [vector],
      view: new View({
        projection: proj,
        center: project(region.center),
        zoom: earth ? 12 : 10,
        minZoom: earth ? 3 : 2,
        maxZoom: earth ? 19 : 17,
      }),
    });
    mapRef.current = map;
    map.on("pointermove", (e) =>
      useMission.getState().set({ cursor: unproject(e.coordinate) }),
    );
    map.on("singleclick", (e) => {
      const s = useMission.getState(),
        point = unproject(e.coordinate);
      if (s.tool === "waypoint") {
        s.patch({
          waypoints: [...s.mission.waypoints, point],
          route: [],
          elapsed: 0,
        });
      } else if (s.tool === "station") {
        s.patch({
          stations: [
            ...s.mission.stations,
            makeStation(point, s.stationType, s.mission.stations.length),
          ],
        });
      } else {
        const f = map.forEachFeatureAtPixel(e.pixel, (f) => f);
        s.set({
          selected: f?.get("id") ?? null,
          notice:
            f?.get("description") ??
            "Click waypoints or stations to inspect. Drag waypoints with the waypoint tool.",
        });
      }
    });
    const modify = new Modify({
      source,
      filter: (f) =>
        f.get("kind") === "waypoint" || f.get("kind") === "station",
    });
    map.addInteraction(modify);
    modify.on("modifyend", (e) => {
      const s = useMission.getState(),
        wps = [...s.mission.waypoints],
        stations = [...s.mission.stations];
      for (const f of e.features.getArray()) {
        const p = unproject((f.getGeometry() as OlPoint).getCoordinates());
        if (f.get("kind") === "waypoint") wps[f.get("index")] = p;
        else {
          const i = stations.findIndex((n) => n.id === f.get("id"));
          if (i >= 0) stations[i] = { ...stations[i], point: p };
        }
      }
      s.patch({ waypoints: wps, stations, route: [], elapsed: 0 });
    });
    return () => {
      map.setTarget(undefined);
      map.dispose();
      mapRef.current = null;
      source.clear();
    };
  }, [region]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    for (const l of rasterRef.current) map.removeLayer(l);
    rasterRef.current = [];
    const add = async (id: string) => {
      try {
        let layer: TileLayer;
        if (region.body === "earth") {
          layer = new TileLayer({
            source: new TileWMS({
              url: "https://tiles.maps.eox.at/wms",
              params: { LAYERS: "s2cloudless-2020", FORMAT: "image/jpeg" },
              crossOrigin: "anonymous",
              attributions: sources.find((s) => s.id === "earth")!.attribution,
            }),
          });
        } else {
          const s = sources.find((s) => s.id === id)!;
          const response = await fetch(capabilitiesUrl(s.layer!), {
            signal: AbortSignal.timeout(12000),
          });
          if (!response.ok) throw Error(`HTTP ${response.status}`);
          const parsed = new WMTSCapabilities().read(await response.text());
          const advertised = parsed.Contents.Layer.find(
            (l: { Identifier: string }) => l.Identifier === s.layer,
          );
          if (!advertised)
            throw Error("Requested layer absent from capabilities");
          const matrixId = advertised.TileMatrixSetLink[0].TileMatrixSet;
          const matrix = parsed.Contents.TileMatrixSet.find(
            (m: { Identifier: string }) => m.Identifier === matrixId,
          );
          const crs = matrix.SupportedCRS;
          // Interpret the provider's geographic matrix exactly as advertised.
          // The display projection and all physical calculations use Mars radius.
          // Unknown/projected CRSs need a dedicated adapter, never a guessed grid.
          if (!/4326|CRS:?84/.test(crs) || !getProjection(crs))
            throw Error("Unverified Mars tile CRS; dedicated adapter required");
          const options = optionsFromCapabilities(parsed, {
            layer: advertised.Identifier,
            matrixSet: matrixId,
          });
          if (!options) throw Error("Unsupported matrix set");
          layer = new TileLayer({
            source: new WMTS({
              ...options,
              projection: mars,
              crossOrigin: "anonymous",
              attributions: s.attribution,
            }),
          });
        }
        if (cancelled) return;
        layer.setOpacity(opacity);
        layer.getSource()?.on("tileloaderror", () =>
          useMission.getState().set({
            notice: `${id}: imagery unavailable or outside coverage. Scientific targets and local planning remain available.`,
          }),
        );
        rasterRef.current.push(layer);
        map.getLayers().insertAt(0, layer);
      } catch {
        if (!cancelled)
          useMission.getState().set({
            notice: `${id}: remote imagery unavailable. No synthetic basemap has been substituted.`,
          });
      }
    };
    if (!mission.laboratory) {
      if (region.body === "earth" && mission.layers.optical) void add("earth");
      else if (region.body === "mars")
        for (const id of ["optical", "hillshade", "thermal"])
          if (mission.layers[id]) void add(id);
    }
    return () => {
      cancelled = true;
    };
  }, [region, mission.laboratory, mission.layers, opacity]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overlayRef.current) map.removeLayer(overlayRef.current);
    if (!grid || (!mission.layers.elevation && !mission.layers.slope)) return;
    const earth = region.body === "earth";
    const nw = earth
        ? fromLonLat([grid.bounds[0], grid.bounds[3]])
        : [grid.bounds[0], grid.bounds[3]],
      se = earth
        ? fromLonLat([grid.bounds[2], grid.bounds[1]])
        : [grid.bounds[2], grid.bounds[1]];
    const img = document.createElement("canvas");
    img.width = grid.width;
    img.height = grid.height;
    const ctx = img.getContext("2d")!,
      pixels = ctx.createImageData(grid.width, grid.height);
    const finite = grid.values.filter((v): v is number => v !== null),
      min = Math.min(...finite),
      max = Math.max(...finite);
    grid.values.forEach((v, i) => {
      if (v === null) return;
      const t = mission.layers.slope
        ? Math.min(
            1,
            (slope(grid, i % grid.width, Math.floor(i / grid.width)) ?? 0) / 30,
          )
        : (v - min) / (max - min || 1);
      pixels.data.set([45 + t * 170, 70 + t * 65, 65 + t * 15, 210], i * 4);
    });
    ctx.putImageData(pixels, 0, 0);
    const layer = new ImageLayer({
      opacity,
      source: new ImageCanvasSource({
        projection: earth ? "EPSG:3857" : mars,
        canvasFunction: (extent, res, pixelRatio, size) => {
          const c = document.createElement("canvas");
          c.width = size[0];
          c.height = size[1];
          c.getContext("2d")!.drawImage(
            img,
            ((nw[0] - extent[0]) / res) * pixelRatio,
            ((extent[3] - nw[1]) / res) * pixelRatio,
            ((se[0] - nw[0]) / res) * pixelRatio,
            ((nw[1] - se[1]) / res) * pixelRatio,
          );
          return c;
        },
      }),
    });
    overlayRef.current = layer;
    map.getLayers().insertAt(rasterRef.current.length, layer);
  }, [grid, mission.layers.elevation, mission.layers.slope, region, opacity]);
  useEffect(() => {
    if (!mission.route.length || !mapRef.current) return;
    const coords = mission.route.map((p) =>
      region.body === "earth" ? fromLonLat(p) : p,
    );
    mapRef.current
      .getView()
      .fit(new LineString(coords).getExtent(), {
        padding: [130, 70, 100, 80],
        maxZoom: region.body === "earth" ? 15 : 13,
      });
  }, [mission.route, region]);
  useEffect(() => {
    const earth = region.body === "earth",
      project = (p: Point) => (earth ? fromLonLat(p) : p);
    const source = vectors.current;
    source.clear();
    const add = (
      geometry: OlPoint | LineString | Polygon,
      props: Record<string, unknown>,
    ) => source.addFeature(new Feature({ geometry, ...props }));
    if (region.body === "mars" && mission.layers.targets)
      for (const t of targets)
        add(new OlPoint(project(t.point)), {
          kind: "target",
          label: t.name.toUpperCase(),
          id: t.name,
          description: `${t.name}: candidate skylight, ${t.published[0]}°E, ${t.published[1]}°, published elevation ${t.elevation} m. Cushing et al. 2007. Accessible cave entrance unconfirmed.`,
        });
    mission.waypoints.forEach((p, i) =>
      add(new OlPoint(project(p)), {
        kind: "waypoint",
        index: i,
        label: `${i === 0 ? "START" : i === mission.waypoints.length - 1 ? "DESTINATION" : "SCIENCE STOP"} ${i + 1}`,
      }),
    );
    if (mission.layers.route && mission.route.length)
      add(new LineString(mission.route.map(project)), { kind: "route" });
    if (mission.layers.stations)
      for (const s of mission.stations) {
        add(new OlPoint(project(s.point)), {
          kind: "station",
          id: s.id,
          label: s.name,
        });
        if (mission.layers.coverage) {
          const latScale = 180 / Math.PI / bodies[region.body].radius;
          const ring = Array.from({ length: 65 }, (_, i) => {
            const a = (i / 64) * Math.PI * 2;
            return project([
              s.point[0] +
                (Math.cos(a) * s.range * latScale) /
                  Math.cos((s.point[1] * Math.PI) / 180),
              s.point[1] + Math.sin(a) * s.range * latScale,
            ]);
          });
          add(new Polygon([ring]), { kind: "coverage" });
        }
      }
    if (mission.layers.links) {
      for (const l of net.links)
        add(
          new LineString([
            project(mission.stations.find((s) => s.id === l.a)!.point),
            project(mission.stations.find((s) => s.id === l.b)!.point),
          ]),
          {
            kind: "link",
            clear: l.status === "Model clear",
            description: l.status,
          },
        );
    }
    if (mission.dust !== "clear" && mission.layers.dust) {
      const hazard = dustHazard(mission)!;
      const c = hazard.center,
        r = ((hazard.radius / bodies[region.body].radius) * 180) / Math.PI;
      add(
        new Polygon([
          Array.from({ length: 65 }, (_, i) =>
            project([
              c[0] +
                (Math.cos((i / 64) * Math.PI * 2) * r) /
                  Math.cos((c[1] * Math.PI) / 180),
              c[1] + Math.sin((i / 64) * Math.PI * 2) * r,
            ]),
          ),
        ]),
        {
          kind: "hazard",
          description: "Simulated dust extent; uncertain, not observed weather",
        },
      );
    }
    if (mission.route.length) {
      const sim = simulation(
        mission.route,
        region.body,
        grid,
        mission.profile,
        mission.elapsed,
      );
      add(new OlPoint(project(sim.position)), {
        kind: "rover",
        label: mission.mode === "walk" ? "EVA • SIM" : "ROVER • SIM",
      });
    }
  }, [mission, grid, region, net]);
  return (
    <div
      ref={host}
      tabIndex={0}
      className="map-canvas"
      aria-label={`${region.name} interactive map`}
    />
  );
}
