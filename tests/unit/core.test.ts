import { describe, it, expect } from "vitest";
import {
  distance,
  normalizeLongitude,
  targets,
  length,
  interpolate,
} from "../../lib/geo";
import { astar, routeStats } from "../../lib/routing";
import { syntheticGrid, type Grid } from "../../lib/terrain";
import {
  makeStation,
  deploy,
  link,
  network,
  simulation,
  energy,
  missionSchema,
  defaultProfile,
  telemetry,
} from "../../lib/mission";
import { initialMission, useMission } from "../../stores/mission";
function flat(): Grid {
  return {
    width: 7,
    height: 7,
    bounds: [0, 0, 0.006, 0.006],
    values: Array(49).fill(0),
    body: "earth",
    classification: "simulated",
    source: "test fixture",
    resolution: "test",
    datum: "test",
  };
}
describe("planetary geometry", () => {
  it("normalizes east longitude", () => {
    expect(normalizeLongitude(240.03)).toBeCloseTo(-119.97);
    expect(normalizeLongitude(-480.98)).toBeCloseTo(-120.98);
  });
  it("uses the selected planetary radius", () => {
    expect(
      distance([0, 0], [1, 0], "mars") / distance([0, 0], [1, 0], "earth"),
    ).toBeCloseTo(3389500 / 6371008.8);
  });
  it("matches published target geometry", () => {
    const a = distance(targets[0].point, targets[1].point, "mars") / 1000,
      b = distance(targets[1].point, targets[2].point, "mars") / 1000;
    expect(a).toBeCloseTo(60.7, 0);
    expect(b).toBeCloseTo(120, 0);
    expect(2 * (a + b)).toBeCloseTo(361.4, 0);
  });
});
describe("numeric terrain A*", () => {
  it("finds a flat diagonal in metric units", () => {
    const g = flat(),
      route = astar(g, [0, 0.006], [0.006, 0], {
        maxSlope: 20,
        slopeWeight: 5,
      });
    expect(route.length).toBe(7);
    expect(length(route, "earth")).toBeGreaterThanOrEqual(
      distance(route[0], route.at(-1)!, "earth") - 1e-5,
    );
    expect(routeStats(route, "earth", g).gain).toBe(0);
  });
  it("avoids NoData and prevents diagonal corner cutting", () => {
    const g = flat();
    g.values[24] = null;
    const route = astar(g, [0, 0.006], [0.006, 0], {
      maxSlope: 20,
      slopeWeight: 1,
    });
    expect(route).not.toContainEqual([0.003, 0.003]);
    expect(route.length).toBeGreaterThan(7);
  });
  it("rejects disconnected and steep terrain", () => {
    const g = flat();
    for (let x = 0; x < 7; x++) g.values[21 + x] = null;
    expect(() =>
      astar(g, [0, 0.006], [0.006, 0], { maxSlope: 20, slopeWeight: 1 }),
    ).toThrow("No feasible");
    g.values.fill(0);
    for (let x = 0; x < 7; x++) g.values[21 + x] = 10000;
    expect(() =>
      astar(g, [0, 0.006], [0.006, 0], { maxSlope: 5, slopeWeight: 1 }),
    ).toThrow();
  });
  it("excludes invalid endpoints", () => {
    expect(() =>
      astar(flat(), [-1, 0], [0, 0], { maxSlope: 20, slopeWeight: 1 }),
    ).toThrow();
  });
  it("recalculates after manual waypoint changes", () => {
    expect(
      routeStats(
        [
          [0, 0],
          [0.001, 0],
        ],
        "earth",
        flat(),
      ).distance,
    ).toBeLessThan(
      routeStats(
        [
          [0, 0],
          [0.004, 0],
        ],
        "earth",
        flat(),
      ).distance,
    );
  });
});
describe("network and energy", () => {
  it("honors range, terrain obstruction and unknown DEM", () => {
    const a = makeStation([0, 0.003], "H", 0),
      b = makeStation([0.006, 0.003], "R", 1),
      g = flat();
    expect(link(a, b, "earth", g)).toBe("Model clear");
    expect(link(a, b, "earth", null)).toBe("Unknown terrain");
    b.range = 10;
    expect(link(a, b, "earth", g)).toBe("Beyond range");
    b.range = 5000;
    g.values[24] = 200;
    expect(link(a, b, "earth", g)).toBe("Terrain obstructed");
    expect(network([a, b], "earth", g).disconnected).toBe(1);
    expect(network([b], "earth", g).disconnected).toBe(1);
  });
  it("places endpoints with bounded spacing", () => {
    const nodes = deploy(
      [
        [0, 0.003],
        [0.006, 0.003],
      ],
      "earth",
      200,
    );
    expect(nodes[0].type).toBe("H");
    nodes
      .slice(1)
      .forEach((n, i) =>
        expect(distance(n.point, nodes[i].point, "earth")).toBeLessThanOrEqual(
          201,
        ),
      );
  });
  it("distinguishes sensor power from charging infrastructure", () => {
    expect(makeStation([0, 0], "S", 0).chargePower).toBe(0);
    expect(makeStation([0, 0], "C", 0).chargePower).toBeGreaterThan(0);
  });
  it("computes physical energy budget", () =>
    expect(energy(1000, 100, defaultProfile)).toBeCloseTo(0.8));
});
describe("deterministic simulation and persistence", () => {
  const route: [number, number][] = [
    [0, 0],
    [0.01, 0],
  ];
  it("interpolates route and consumes distance energy", () => {
    const a = simulation(route, "earth", null, defaultProfile, 120);
    expect(a).toEqual(simulation(route, "earth", null, defaultProfile, 120));
    expect(a.distance).toBeCloseTo((defaultProfile.speed / 3.6) * 120);
    expect(a.battery).toBeLessThan(100);
    expect(interpolate(route, 0, "earth")).toEqual(route[0]);
    expect(simulation(route, "earth", null, defaultProfile, 0).battery).toBe(
      100,
    );
    expect(
      simulation(
        route,
        "earth",
        null,
        { ...defaultProfile, capacity: 0.01 },
        1000,
      ).battery,
    ).toBe(0);
  });
  it("restores validated data and rejects hostile inputs", () => {
    const m = initialMission();
    m.stations = [makeStation([0, 0], "R", 0)];
    expect(missionSchema.parse(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(() =>
      missionSchema.parse({ ...m, profile: { ...m.profile, speed: 0 } }),
    ).toThrow();
    expect(() =>
      missionSchema.parse({ ...m, waypoints: [[200, 0]] }),
    ).toThrow();
    useMission.getState().restore(m);
    expect(useMission.getState().playing).toBe(false);
  });
  it("uses seeded telemetry and deterministic laboratory terrain", () => {
    const node = makeStation([0, 0], "S", 0);
    expect(telemetry(node, 100)).toEqual(telemetry(node, 100));
    expect(syntheticGrid([0, 0], 0.01, "earth")).toEqual(
      syntheticGrid([0, 0], 0.01, "earth"),
    );
  });
});
