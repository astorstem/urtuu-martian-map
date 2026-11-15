"use client";
import dynamic from "next/dynamic";
import { dustHazard, intersectsHazard } from "@/lib/hazards";
import { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Compass,
  Layers,
  MapPin,
  Radio,
  Route,
  Save,
  Upload,
  Download,
  Play,
  Pause,
  RotateCcw,
  Mountain,
  Orbit,
  FlaskConical,
  ShieldAlert,
  Waypoints,
  Satellite,
  Plus,
  Trash2,
  LocateFixed,
} from "lucide-react";
import { Button } from "./ui/button";
import { useMission, initialMission } from "@/stores/mission";
import { regions, targets, length, type Point, type Region } from "@/lib/geo";
import { syntheticGrid, elevation, type Grid } from "@/lib/terrain";
import { astar, routeStats } from "@/lib/routing";
import {
  deploy,
  energy,
  network,
  simulation,
  telemetry,
  missionSchema,
  type Mission,
  type Station,
} from "@/lib/mission";
import { sources } from "@/lib/sources";
const MapView = dynamic(() => import("./map"), {
  ssr: false,
  loading: () => <div className="loading">Initializing planetary map…</div>,
});
const Terrain = dynamic(() => import("./terrain"), { ssr: false });
function download(name: string, value: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([value], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Field({
  label,
  value,
  onChange,
  min = 0,
  max = 10000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = +e.target.value;
          if (Number.isFinite(v) && v >= min && v <= max) onChange(v);
        }}
      />
    </label>
  );
}
export default function MissionControl() {
  const s = useMission(),
    { mission: m, grid, patch, set } = s,
    region = regions[m.region];
  const [tab, setTab] = useState("Route"),
    [opacity, setOpacity] = useState(0.8),
    [sourcesOpen, setSourcesOpen] = useState(false),
    [spacing, setSpacing] = useState(2000),
    [leftOpen, setLeftOpen] = useState(true);
  const file = useRef<HTMLInputElement>(null);
  const stats = useMemo(
      () => routeStats(m.route, region.body, grid),
      [m.route, region.body, grid],
    ),
    net = useMemo(
      () => network(m.stations, region.body, grid),
      [m.stations, region.body, grid],
    ),
    sim = simulation(m.route, region.body, grid, m.profile, m.elapsed),
    duration = stats.distance / (m.profile.speed / 3.6),
    estimatedEnergy = energy(stats.distance, stats.gain ?? 0, m.profile),
    selected = m.stations.find((n) => n.id === s.selected);
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!sourcesOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const elements = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          "button,a[href],input:not([hidden]),select",
        ) ?? [],
      );
    elements()[0]?.focus();
    const keyboard = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSourcesOpen(false);
      if (e.key === "Tab") {
        const controls = elements(),
          first = controls[0],
          last = controls.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [sourcesOpen]);
  const warnings = [
    !grid
      ? "No numerical DEM: terrain viability is unverified."
      : grid.classification === "simulated"
        ? "Synthetic laboratory terrain. Results do not describe this geographic site."
        : null,
    m.route.length && stats.gain === null
      ? "Route extends beyond DEM coverage. Elevation and energy are incomplete."
      : null,
    estimatedEnergy >
    (m.profile.capacity * (m.profile.initial - m.profile.reserve)) / 100
      ? "Energy reserve would be exceeded. Revise route or model a charging operation."
      : null,
    m.mode === "walk" &&
    (duration * 2) / 3600 >
      m.profile.evaHours * (1 - m.profile.returnReserve / 100)
      ? "Outbound and return travel exceed the EVA time budget."
      : null,
    m.dust !== "clear"
      ? intersectsHazard(m)
        ? "Simulated dust intersects the route. Reconsider, delay or shelter; no safe bypass is guaranteed."
        : "Simulated dust active; current route has no intersection under this model."
      : null,
    net.disconnected
      ? `${net.disconnected} node(s) lack a verified connection to a hub under this model.`
      : null,
  ].filter(Boolean);
  useEffect(() => {
    let cancelled = false;
    const r = regions[m.region];
    if (m.laboratory) {
      set({ grid: syntheticGrid(r.center, r.span, r.body) });
      return;
    }
    set({ grid: null });
    fetch(`/geodata/${m.region}.json`)
      .then((r) => {
        if (!r.ok) throw Error("No DEM");
        return r.json();
      })
      .then((g: Grid) => {
        if (
          g.body !== r.body ||
          g.values.length !== g.width * g.height ||
          g.classification !== "derived" ||
          g.width > 256 ||
          g.height > 256 ||
          g.values.some((v) => v !== null && !Number.isFinite(v))
        )
          throw Error("Invalid DEM");
        if (!cancelled) set({ grid: g });
      })
      .catch(() => {
        if (!cancelled)
          set({
            notice:
              "Regional numerical DEM is unavailable. Manual geometry works; terrain analysis remains unverified.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [m.region, m.laboratory, set]);
  useEffect(() => {
    if (!s.playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now(),
        state = useMission.getState(),
        mission = state.mission,
        r = regions[mission.region],
        total = length(mission.route, r.body) / (mission.profile.speed / 3.6),
        elapsed = Math.min(
          total,
          mission.elapsed + ((now - last) / 1000) * mission.speed,
        );
      last = now;
      const current = simulation(
        mission.route,
        r.body,
        state.grid,
        mission.profile,
        elapsed,
      );
      state.patch({ elapsed });
      if (elapsed >= total || current.battery <= mission.profile.reserve)
        state.set({
          playing: false,
          notice:
            current.battery <= mission.profile.reserve
              ? "Playback stopped at the configured energy reserve."
              : "Simulation complete. Review the mission summary.",
        });
    }, 100);
    return () => clearInterval(id);
  }, [s.playing]);
  const profile = (key: keyof Mission["profile"], value: number) =>
    patch({ profile: { ...m.profile, [key]: value }, elapsed: 0 });
  function changeRegion(value: Region) {
    patch({ ...initialMission(), region: value, laboratory: m.laboratory });
    set({ selected: null, grid: null, playing: false });
  }
  function buildRoute() {
    try {
      if (!grid)
        throw Error(
          "Load a numerical DEM or enable the synthetic laboratory to run A*.",
        );
      if (m.waypoints.length < 2)
        throw Error("Add at least two waypoints on the map.");
      let route: Point[] = [];
      for (let i = 1; i < m.waypoints.length; i++) {
        const path = astar(grid, m.waypoints[i - 1], m.waypoints[i], {
          maxSlope: m.profile.maxSlope,
          slopeWeight: m.mode === "walk" ? 8 : 15,
          hazard: dustHazard(m),
        });
        route = route.concat(i === 1 ? path : path.slice(1));
      }
      patch({ route, elapsed: 0 });
      set({
        notice:
          "A* proposed traverse computed. Grid cell centers define endpoints. Model output is not field-validated.",
      });
    } catch (e) {
      set({ notice: (e as Error).message });
    }
  }
  function sample() {
    const c = region.center,
      d = region.span * 0.65;
    patch({
      waypoints: [
        [c[0] - d, c[1] - d * 0.5],
        [c[0] + d * 0.2, c[1] + d * 0.6],
        [c[0] + d, c[1] - d * 0.2],
      ],
      route: [],
      elapsed: 0,
    });
    set({
      tool: "waypoint",
      notice:
        "Three proposed science waypoints added. Drag them to edit, then generate a route.",
    });
  }
  function exportMission() {
    download(`urtuu-${m.region}.json`, JSON.stringify(m, null, 2));
    set({
      notice: "Mission JSON exported with planetary region and schema version.",
    });
  }
  function updateStation(values: Partial<Station>) {
    if (selected)
      patch({
        stations: m.stations.map((n) =>
          n.id === selected.id ? { ...n, ...values } : n,
        ),
      });
  }
  return (
    <main className="mission-app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-symbol">
            <Orbit size={27} />
          </div>
          <div>
            <strong>
              ӨРТӨӨ <span>/ URTUU</span>
            </strong>
            <small>PLANETARY MISSION CONTROL</small>
          </div>
        </div>
        <div className="top-divider" />
        <label className="environment-select">
          <span>OPERATIONAL THEATER</span>
          <select
            aria-label="Environment"
            value={m.region}
            onChange={(e) => changeRegion(e.target.value as Region)}
          >
            <option value="mars">Mars / Arsia Mons</option>
            <option value="khermen">Earth Analog / Khermen Tsav</option>
            <option value="tsagaan">Earth Analog / Tsagaan Suvarga</option>
          </select>
        </label>
        <div className="top-status">
          <i /> PLANNING SESSION
        </div>
        <div className="top-actions">
          <Button
            onClick={() => {
              try {
                localStorage.setItem("urtuu-mission", JSON.stringify(m));
                set({ notice: "Mission saved in this browser." });
              } catch {
                set({
                  notice:
                    "Browser storage unavailable. Export JSON to save the mission.",
                });
              }
            }}
          >
            <Save size={14} />
            Save
          </Button>
          <Button
            onClick={() => {
              try {
                const saved = localStorage.getItem("urtuu-mission");
                if (!saved) throw Error("No saved mission in this browser.");
                s.restore(JSON.parse(saved));
                set({ notice: "Saved mission restored." });
              } catch (e) {
                set({ notice: (e as Error).message });
              }
            }}
          >
            <Upload size={14} />
            Load
          </Button>
          <Button onClick={exportMission}>
            <Download size={14} />
            Export
          </Button>
        </div>
      </header>
      <section className="contextbar">
        <div>
          <span className="eyebrow">{region.code}</span>
          <ChevronRight size={13} />
          <span>{region.name} exploration</span>
          <span className="context-tag">
            {m.mode === "walk" ? "LOCAL MARSWALK / EVA" : "SURFACE EXPEDITION"}
          </span>
        </div>
        <button onClick={() => setSourcesOpen(true)}>
          <span className="status-dot" />
          Data & provenance <ArrowUpRight size={13} />
        </button>
      </section>
      <div className="workspace">
        <aside className={`left-panel ${leftOpen ? "" : "collapsed"}`}>
          <div className="panel-heading">
            <Layers size={16} />
            <h2>Map layers</h2>
            <button
              aria-label="Collapse layers"
              onClick={() => setLeftOpen(!leftOpen)}
            >
              −
            </button>
          </div>
          <p className="panel-caption">A clearer view of the unknown.</p>
          <div className="layer-group">
            <h3>01 / IMAGERY</h3>
            {[
              [
                "optical",
                region.body === "mars"
                  ? "Viking optical mosaic"
                  : "Sentinel-2 cloudless",
              ],
              ...(region.body === "mars"
                ? [
                    ["hillshade", "MOLA color hillshade"],
                    ["thermal", "THEMIS day infrared"],
                  ]
                : []),
            ].map(([id, label]) => (
              <label className="layer-row" key={id}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={!!m.layers[id]}
                  onChange={(e) =>
                    patch({ layers: { ...m.layers, [id]: e.target.checked } })
                  }
                />
                <span>{label}</span>
                <small>↗</small>
              </label>
            ))}
            <label className="opacity">
              Raster opacity <span>{Math.round(opacity * 100)}%</span>
              <input
                type="range"
                aria-label="Raster opacity"
                min="0"
                max="1"
                step=".05"
                value={opacity}
                onChange={(e) => setOpacity(+e.target.value)}
              />
            </label>
          </div>
          <div className="layer-group">
            <h3>02 / TERRAIN & SCIENCE</h3>
            {[
              ["elevation", "Elevation"],
              ["slope", "Slope analysis"],
              ["targets", "Scientific targets"],
            ].map(([id, label]) => (
              <label className="layer-row" key={id}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={!!m.layers[id]}
                  onChange={(e) =>
                    patch({ layers: { ...m.layers, [id]: e.target.checked } })
                  }
                />
                <span>{label}</span>
                <small>{id === "targets" ? "●" : grid ? "DEM" : "—"}</small>
              </label>
            ))}
            <p className="micro">
              {grid ? grid.resolution : "Numerical terrain unavailable"}
              <br />
              Geology: reference only · no polygons
            </p>
          </div>
          <div className="layer-group">
            <h3>03 / MISSION OVERLAYS</h3>
            {[
              ["route", "Planned traverse"],
              ["stations", "Өртөө stations"],
              ["links", "Communication links"],
              ["coverage", "Nominal radio range"],
              ["dust", "Dust simulation"],
            ].map(([id, label]) => (
              <label className="layer-row" key={id}>
                <input
                  type="checkbox"
                  aria-label={label}
                  checked={!!m.layers[id]}
                  onChange={(e) =>
                    patch({ layers: { ...m.layers, [id]: e.target.checked } })
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          <div className="lab-box">
            <FlaskConical size={17} />
            <div>
              <label>
                <input
                  aria-label="Synthetic laboratory"
                  type="checkbox"
                  checked={m.laboratory}
                  onChange={(e) => {
                    patch({
                      laboratory: e.target.checked,
                      route: [],
                      elapsed: 0,
                      layers: { ...m.layers, elevation: e.target.checked },
                    });
                    set({ playing: false });
                  }}
                />{" "}
                Synthetic laboratory
              </label>
              <p>
                Generated terrain for algorithm demonstrations. Not site
                observations.
              </p>
            </div>
          </div>
          <button className="source-link" onClick={() => setSourcesOpen(true)}>
            Explore data sources <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span>FROM THE MONGOLIAN STEPPE</span>
            <strong>TO MARS.</strong>
            <span>2026 SPACE APPS PROJECT</span>
          </div>
        </aside>
        <section className="map-section">
          <div className="map-top">
            <div className="map-title">
              <span className="eyebrow">
                {m.laboratory ? "SYNTHETIC LABORATORY" : "EXPLORATION PLANNING"}
              </span>
              <h1>
                {region.name}
                <span> / {region.body === "mars" ? "MARS" : "MONGOLIA"}</span>
              </h1>
            </div>
            <div className="view-toggle">
              <button
                className={s.view === "2d" ? "active" : ""}
                onClick={() => set({ view: "2d" })}
              >
                <Layers size={14} />
                2D Map
              </button>
              <button
                className={s.view === "3d" ? "active" : ""}
                onClick={() => set({ view: "3d" })}
              >
                <Mountain size={14} />
                3D Terrain
              </button>
            </div>
          </div>
          {s.view === "2d" ? <MapView opacity={opacity} /> : <Terrain />}
          <div className="map-tools">
            <button
              title="Inspect features"
              aria-label="Inspect features"
              className={s.tool === "inspect" ? "active" : ""}
              onClick={() => set({ tool: "inspect" })}
            >
              <Compass size={19} />
            </button>
            <button
              title="Add waypoints"
              aria-label="Add waypoints"
              className={s.tool === "waypoint" ? "active" : ""}
              onClick={() => set({ tool: "waypoint" })}
            >
              <Waypoints size={19} />
            </button>
            <button
              title="Place station"
              aria-label="Place station"
              className={s.tool === "station" ? "active" : ""}
              onClick={() => set({ tool: "station" })}
            >
              <Radio size={19} />
            </button>
            <button
              title="Show layers"
              aria-label="Show layers"
              onClick={() => setLeftOpen(!leftOpen)}
            >
              <Layers size={19} />
            </button>
          </div>
          <div className="north">
            <span>N</span>
            <Compass size={32} />
          </div>
          <div className="map-legend">
            <span>
              <i className="legend-route" />
              Proposed traverse
            </span>
            <span>
              <i className="legend-station" />
              Өртөө node
            </span>
            <span>
              <i className="legend-target" />
              Science target
            </span>
          </div>
          <div className="map-coordinate">
            <LocateFixed size={13} />
            {s.cursor
              ? `${s.cursor[1].toFixed(5)}° / ${s.cursor[0].toFixed(5)}°`
              : "MOVE POINTER TO INSPECT"}
            <span>
              {grid && s.cursor && elevation(grid, s.cursor) !== null
                ? `${elevation(grid, s.cursor)} m`
                : "Elevation: no sample"}
            </span>
            <span>
              {region.body === "mars"
                ? "MARS R 3,389.5 km"
                : "WGS84 coordinates · spherical distance"}
            </span>
          </div>
        </section>
        <aside className="right-panel">
          <div className="panel-heading">
            <Route size={16} />
            <h2>Mission planner</h2>
            <span className="version">01</span>
          </div>
          <div className="planner-tabs">
            {["Route", "Network", "Rover", "Safety"].map((t) => (
              <button
                key={t}
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="planner-content">
            {tab === "Route" && (
              <>
                <div className="section-label">TRAVERSE CONFIGURATION</div>
                <div className="mode-switch">
                  <button
                    className={m.mode === "rover" ? "active" : ""}
                    onClick={() =>
                      patch({
                        mode: "rover",
                        profile: { ...m.profile, speed: 8, maxSlope: 20 },
                      })
                    }
                  >
                    Rover expedition
                  </button>
                  <button
                    className={m.mode === "walk" ? "active" : ""}
                    onClick={() =>
                      patch({
                        mode: "walk",
                        profile: { ...m.profile, speed: 3, maxSlope: 15 },
                      })
                    }
                  >
                    Marswalk / EVA
                  </button>
                </div>
                <div className="waypoint-card">
                  <div className="waypoint-line">
                    <i />
                    <span>START POSITION</span>
                    <small>
                      {m.waypoints[0]
                        ? m.waypoints[0].map((v) => v.toFixed(3)).join(", ")
                        : "Select on map"}
                    </small>
                  </div>
                  <div className="waypoint-line destination">
                    <i />
                    <span>SCIENCE DESTINATION</span>
                    <small>
                      {m.waypoints.length > 1
                        ? m.waypoints
                            .at(-1)!
                            .map((v) => v.toFixed(3))
                            .join(", ")
                        : "Awaiting coordinates"}
                    </small>
                  </div>
                </div>
                <div className="two-buttons">
                  <Button onClick={() => set({ tool: "waypoint" })}>
                    <Plus size={13} />
                    Add waypoint
                  </Button>
                  <Button onClick={sample}>Demo waypoints</Button>
                </div>
                <p className="micro">
                  {m.waypoints.length} waypoints · click to add, drag to adjust.
                </p>
                <Field
                  label="Max slope assumption (°)"
                  value={m.profile.maxSlope}
                  min={1}
                  max={60}
                  onChange={(v) => profile("maxSlope", v)}
                />
                <Button variant="default" className="wide" onClick={buildRoute}>
                  <Route size={16} />
                  Generate terrain route
                  <ArrowUpRight size={16} />
                </Button>
                <div className="two-buttons">
                  <Button
                    disabled={m.waypoints.length < 2}
                    onClick={() => {
                      patch({ route: [...m.waypoints], elapsed: 0 });
                      set({
                        notice:
                          "Manual straight segments: terrain feasibility unverified.",
                      });
                    }}
                  >
                    Use manual route
                  </Button>
                  <Button
                    onClick={() =>
                      patch({ waypoints: [], route: [], elapsed: 0 })
                    }
                  >
                    Clear route
                  </Button>
                </div>
                {region.body === "mars" && (
                  <button
                    className="text-button"
                    onClick={() => {
                      const base: Point = [-119.99, -6.54],
                        points = [
                          base,
                          targets[1].point,
                          targets[2].point,
                          targets[1].point,
                          base,
                        ];
                      patch({ waypoints: points, route: points, elapsed: 0 });
                      set({
                        notice:
                          "Proposed base near Annie, not site-validated. Regional geometry is a minimum, not a verified traverse. 425 km remains an illustrative assumption.",
                      });
                    }}
                  >
                    Load Annie → Dena → Chloë expedition ↗
                  </button>
                )}
                <div className="stats-grid">
                  <div>
                    <span>DISTANCE</span>
                    <strong>
                      {(stats.distance / 1000).toFixed(2)}
                      <small> km</small>
                    </strong>
                  </div>
                  <div>
                    <span>TRAVEL ESTIMATE</span>
                    <strong>
                      {(duration / 3600).toFixed(1)}
                      <small> h</small>
                    </strong>
                  </div>
                  <div>
                    <span>ELEVATION GAIN</span>
                    <strong>
                      {stats.gain === null ? "—" : Math.round(stats.gain)}
                      <small> m</small>
                    </strong>
                  </div>
                  <div>
                    <span>PEAK SEGMENT SLOPE</span>
                    <strong>
                      {stats.maxSlope === null
                        ? "—"
                        : stats.maxSlope.toFixed(1)}
                      <small> °</small>
                    </strong>
                  </div>
                </div>
                <div className="profile-chart">
                  <div className="section-label">
                    ELEVATION PROFILE <span>METRES</span>
                  </div>
                  {grid && m.route.length > 1 ? (
                    <svg
                      viewBox="0 0 260 80"
                      role="img"
                      aria-label="Route elevation profile"
                    >
                      <polyline
                        fill="none"
                        stroke="#d99d6c"
                        strokeWidth="2"
                        points={(() => {
                          const heights = m.route.map((p) =>
                            elevation(grid, p),
                          );
                          const values = heights.filter(
                              (v): v is number => v !== null,
                            ),
                            min = Math.min(...values),
                            max = Math.max(...values);
                          return heights
                            .map(
                              (v, i) =>
                                `${(i / (heights.length - 1)) * 260},${v === null ? 80 : 70 - ((v - min) / (max - min || 1)) * 60}`,
                            )
                            .join(" ");
                        })()}
                      />
                    </svg>
                  ) : (
                    <p className="micro">
                      Requires a route within numerical DEM coverage.
                    </p>
                  )}
                </div>
                {m.mode === "walk" && (
                  <>
                    <Field
                      label="Available EVA (h)"
                      min={0.1}
                      step={0.5}
                      max={100}
                      value={m.profile.evaHours}
                      onChange={(v) => profile("evaHours", v)}
                    />
                    <Field
                      label="Time reserve (%)"
                      max={90}
                      value={m.profile.returnReserve}
                      onChange={(v) => profile("returnReserve", v)}
                    />
                    <p className="micro">
                      Return assumes retracing the outbound route. Round trip{" "}
                      {((stats.distance * 2) / 1000).toFixed(2)} km,{" "}
                      {((duration * 2) / 3600).toFixed(1)} h. Consumables are
                      not modeled; EVA time is a configurable proxy.
                    </p>
                  </>
                )}
              </>
            )}
            {tab === "Network" && (
              <>
                <div className="section-label">
                  ӨРТӨӨ / RELAY INFRASTRUCTURE
                </div>
                <label className="field">
                  Station type
                  <select
                    aria-label="Station type"
                    value={s.stationType}
                    onChange={(e) =>
                      set({ stationType: e.target.value as Station["type"] })
                    }
                  >
                    <option value="H">URT-H · Mission hub</option>
                    <option value="S">URT-S · Sensor</option>
                    <option value="R">URT-R · Radio relay</option>
                    <option value="C">URT-C · Charging depot</option>
                  </select>
                </label>
                <Button
                  className="wide"
                  onClick={() => set({ tool: "station" })}
                >
                  <MapPin size={15} />
                  Place station on map
                </Button>
                <Field
                  label="Auto spacing (m)"
                  min={100}
                  max={30000}
                  step={100}
                  value={spacing}
                  onChange={setSpacing}
                />
                <Button
                  className="wide"
                  disabled={m.route.length < 2}
                  onClick={() => {
                    patch({ stations: deploy(m.route, region.body, spacing) });
                    set({
                      notice:
                        "Candidate nodes placed along the route. Inspect terrain and connectivity before adopting them.",
                    });
                  }}
                >
                  Auto Deploy Өртөө
                </Button>
                <p className="micro">
                  Regional suggested spacing: 25–30 km. Range circles are
                  assumptions; terrain and planetary curvature can block links.
                </p>
                <div className="stats-grid">
                  <div>
                    <span>FIELD NODES</span>
                    <strong>{m.stations.length}</strong>
                  </div>
                  <div>
                    <span>DISCONNECTED</span>
                    <strong>{net.disconnected}</strong>
                  </div>
                </div>
                {m.stations.map((n) => (
                  <button
                    className={`station-row ${s.selected === n.id ? "selected" : ""}`}
                    key={n.id}
                    onClick={() => set({ selected: n.id })}
                  >
                    <Radio size={14} />
                    {n.name}
                    <span>SIM</span>
                  </button>
                ))}
                {selected && (
                  <div className="station-details">
                    <label className="field">
                      Name
                      <input
                        value={selected.name}
                        maxLength={80}
                        onChange={(e) =>
                          updateStation({ name: e.target.value })
                        }
                      />
                    </label>
                    <Field
                      label="Antenna height (m)"
                      value={selected.height}
                      min={0.1}
                      max={200}
                      onChange={(v) => updateStation({ height: v })}
                    />
                    <Field
                      label="Radio range (m)"
                      value={selected.range}
                      min={10}
                      max={200000}
                      step={100}
                      onChange={(v) => updateStation({ range: v })}
                    />
                    <p className="micro">
                      SIMULATED TELEMETRY ·{" "}
                      {telemetry(selected, m.elapsed).temperature}°C · battery{" "}
                      {telemetry(selected, m.elapsed).battery}%<br />
                      Known coordinate reference only. No unique position fix
                      from a single beacon.
                    </p>
                    {selected.type === "C" && (
                      <p className="micro">
                        Charging depot: {selected.capacity} kWh /{" "}
                        {selected.chargePower} kW. Charging schedules are not
                        simulated.
                      </p>
                    )}
                    <Button
                      onClick={() => {
                        patch({
                          stations: m.stations.filter(
                            (n) => n.id !== selected.id,
                          ),
                        });
                        set({ selected: null });
                      }}
                    >
                      <Trash2 size={14} />
                      Delete node
                    </Button>
                  </div>
                )}
                {net.links.map((l) => (
                  <p className="micro" key={l.a + l.b}>
                    {m.stations.find((n) => n.id === l.a)?.name} ↔{" "}
                    {m.stations.find((n) => n.id === l.b)?.name}: {l.status}
                  </p>
                ))}
              </>
            )}
            {tab === "Rover" && (
              <>
                <div className="section-label">
                  SIMULATED ENGINEERING PROFILE
                </div>
                {(
                  [
                    ["speed", "Travel speed (km/h)", 0.1, 100, 0.5],
                    ["capacity", "Battery capacity (kWh)", 0.1, 10000, 1],
                    ["initial", "Initial charge (%)", 1, 100, 1],
                    [
                      "consumption",
                      "Base consumption (kWh/km)",
                      0.001,
                      100,
                      0.05,
                    ],
                    ["climb", "Climb cost (kWh/m)", 0, 10, 0.001],
                    ["reserve", "Energy reserve (%)", 0, 90, 1],
                  ] as [
                    keyof Mission["profile"],
                    string,
                    number,
                    number,
                    number,
                  ][]
                ).map(([key, label, min, max, step]) => (
                  <Field
                    key={key}
                    label={label}
                    min={min}
                    max={max}
                    step={step}
                    value={m.profile[key]}
                    onChange={(v) => profile(key, v)}
                  />
                ))}
                <div className="stats-grid">
                  <div>
                    <span>PLANNED ENERGY</span>
                    <strong>
                      {estimatedEnergy.toFixed(1)}
                      <small> kWh</small>
                    </strong>
                  </div>
                  <div>
                    <span>BATTERY ESTIMATE</span>
                    <strong>
                      {sim.battery.toFixed(0)}
                      <small>%</small>
                    </strong>
                  </div>
                </div>
                <p className="micro">
                  Energy = distance × consumption + positive climb × climb
                  coefficient. No regenerative descent. Missing elevation makes
                  this a lower bound. These are editable assumptions, not flight
                  rover specifications.
                </p>
                <p className="micro">
                  425 km illustrative scenario:{" "}
                  {(425 * m.profile.consumption).toFixed(1)} kWh before
                  climbing; at least{" "}
                  {Math.max(
                    0,
                    Math.ceil(
                      (425 * m.profile.consumption) /
                        (m.profile.capacity * (1 - m.profile.reserve / 100)),
                    ) - 1,
                  )}{" "}
                  full equivalent recharges. Depot reachability is not verified.
                </p>
              </>
            )}
            {tab === "Safety" && (
              <>
                <div className="section-label">SCENARIO CONDITIONS</div>
                <label className="field">
                  Dust scenario
                  <select
                    aria-label="Dust scenario"
                    value={m.dust}
                    onChange={(e) =>
                      patch({ dust: e.target.value as Mission["dust"] })
                    }
                  >
                    <option value="clear">Clear</option>
                    <option value="regional">Increasing regional dust</option>
                    <option value="local">Localized hazard</option>
                    <option value="widespread">
                      Widespread reduced visibility
                    </option>
                  </select>
                </label>
                <Button
                  className="wide"
                  onClick={() => patch({ dust: "local" })}
                >
                  Trigger simulated dust
                </Button>
                <p className="micro">
                  Synthetic event starts on selection at the second waypoint (or
                  region center), drifting east with playback. Extent and
                  severity are uncertain scenario assumptions.
                </p>
                <Field
                  label="Assumed radiation (mSv/h)"
                  value={m.profile.radiation}
                  step={0.01}
                  max={1000}
                  onChange={(v) => profile("radiation", v)}
                />
                <p className="micro">
                  User-defined exposure estimate:{" "}
                  {((m.profile.radiation * duration) / 3600).toFixed(3)} mSv
                  outbound. No observed radiation field or official safety
                  threshold.
                </p>
                <Button onClick={buildRoute}>Reconsider terrain route</Button>
                <Button
                  onClick={() => {
                    set({
                      playing: false,
                      notice:
                        "Mission paused for shelter / delay. No shelter location has been site-validated.",
                    });
                  }}
                >
                  Pause for shelter / delay
                </Button>
              </>
            )}
            <div className="warning-list">
              {warnings.map((w, i) => (
                <div className="warning" key={i}>
                  <ShieldAlert size={14} />
                  <span>{w}</span>
                </div>
              ))}
            </div>
            <p className="disclaimer">
              PLANNING TOOL · NOT A SAFETY CERTIFICATION
            </p>
          </div>
        </aside>
      </div>
      <div className="notification" role="status">
        <Satellite size={14} />
        <span>{s.notice}</span>
      </div>
      <footer className="timeline">
        <div className="playback">
          <Button
            variant="default"
            aria-label={s.playing ? "Pause mission" : "Play mission"}
            disabled={m.route.length < 2}
            onClick={() => set({ playing: !s.playing })}
          >
            {s.playing ? <Pause size={18} /> : <Play size={18} />}
          </Button>
          <button
            aria-label="Reset playback"
            onClick={() => {
              patch({ elapsed: 0 });
              set({ playing: false });
            }}
          >
            <RotateCcw size={16} />
          </button>
          <select
            aria-label="Playback speed"
            value={m.speed}
            onChange={(e) => patch({ speed: +e.target.value })}
          >
            {[1, 30, 120, 600, 3600].map((v) => (
              <option value={v} key={v}>
                {v}×
              </option>
            ))}
          </select>
        </div>
        <div className="timeline-track">
          <div>
            <span>MISSION ELAPSED</span>
            <strong>
              {String(Math.floor(m.elapsed / 3600)).padStart(2, "0")}:
              {String(Math.floor(m.elapsed / 60) % 60).padStart(2, "0")}:
              {String(Math.floor(m.elapsed) % 60).padStart(2, "0")}
            </strong>
            <span>{s.playing ? "SIMULATION RUNNING" : "READY / PAUSED"}</span>
          </div>
          <input
            aria-label="Mission timeline"
            type="range"
            min="0"
            max={duration || 1}
            value={Math.min(m.elapsed, duration || 1)}
            onChange={(e) => {
              patch({ elapsed: +e.target.value });
              set({ playing: false });
            }}
          />
        </div>
        <div className="timeline-stat">
          <span>ROVER ENERGY</span>
          <strong>
            {sim.battery.toFixed(0)}% <small>EST.</small>
          </strong>
        </div>
        <div className="timeline-stat">
          <span>NETWORK</span>
          <strong>
            {m.stations.length
              ? `${m.stations.length - net.disconnected}/${m.stations.length} linked`
              : "No nodes"}
          </strong>
        </div>
        <button
          className="report-button"
          onClick={() =>
            download(
              "urtuu-mission-report.txt",
              `URTUU mission summary\nEnvironment: ${region.name} (${region.body})\nTerrain: ${grid?.source ?? "Unavailable"}\nClassification: ${m.laboratory ? "Synthetic laboratory" : "Proposed mission"}\nDistance: ${(stats.distance / 1000).toFixed(3)} km\nDuration: ${(duration / 3600).toFixed(2)} h\nEnergy: ${estimatedEnergy.toFixed(2)} kWh (scenario)\nNodes: ${m.stations.length}\nDisconnected: ${net.disconnected}\nDust: ${m.dust} (simulated)\nWarnings: ${warnings.join("; ")}\nNot field validated.`,
              "text/plain",
            )
          }
        >
          Mission report
          <ArrowUpRight size={15} />
        </button>
      </footer>
      {sourcesOpen && (
        <div className="modal-backdrop" onClick={() => setSourcesOpen(false)}>
          <section
            ref={dialog}
            className="source-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Data sources"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">SCIENCE & TRANSPARENCY</span>
                <h2>Data sources & mission files</h2>
              </div>
              <Button onClick={() => setSourcesOpen(false)}>Close</Button>
            </header>
            <p>
              Published data, derived products, and simulations are distinct.
              Remote layers are checked when enabled; access and geographic
              coverage are not guaranteed.
            </p>
            {sources.map((source) => (
              <article key={source.id}>
                <h3>
                  {source.name} <span>{source.classification}</span>
                </h3>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.organization} ↗
                </a>
                <p>
                  {source.instrument} · {source.period} · {source.resolution}
                </p>
                <p>
                  {source.coverage} · {source.crs} · {source.units}
                </p>
                <p>{source.attribution}</p>
                <small>{source.availability}</small>
              </article>
            ))}
            <div className="two-buttons">
              <Button onClick={() => file.current?.click()}>
                <Upload size={14} />
                Import mission JSON
              </Button>
              <Button
                onClick={() => {
                  const geometry = {
                    type: "FeatureCollection",
                    planetaryBody: region.body,
                    coordinateReference:
                      region.body === "mars"
                        ? "Mars planetocentric degrees; NOT RFC 7946 Earth GeoJSON"
                        : "WGS84",
                    features: [
                      {
                        type: "Feature",
                        properties: {
                          body: region.body,
                          status: "Proposed, unvalidated",
                        },
                        geometry: { type: "LineString", coordinates: m.route },
                      },
                    ],
                  };
                  download(
                    `urtuu-${region.body}-route.${region.body === "mars" ? "json" : "geojson"}`,
                    JSON.stringify(geometry, null, 2),
                  );
                }}
              >
                Export route geometry
              </Button>
              <Button
                onClick={() => {
                  s.restore(initialMission());
                  setSourcesOpen(false);
                }}
              >
                Reset default scenario
              </Button>
            </div>
            <input
              ref={file}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  if (f.size > 5_000_000)
                    throw Error("Mission file exceeds 5 MB");
                  const parsed = missionSchema.parse(
                    JSON.parse(await f.text()),
                  );
                  s.restore(parsed);
                  setSourcesOpen(false);
                  set({ notice: "Validated mission imported." });
                } catch {
                  set({
                    notice:
                      "Import rejected: invalid or unsupported mission schema.",
                  });
                }
                e.target.value = "";
              }}
            />
            <p className="micro">
              Өртөө draws inspiration from Mongolia’s historical relay network.
              Gobi sites are study areas, not approved operational bases.
              Independent Space Apps project; no NASA endorsement.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
