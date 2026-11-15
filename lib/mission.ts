import { z } from "zod";
import { distance, interpolate, length, type Body, type Point } from "./geo";
import { elevation, type Grid } from "./terrain";
export const pointSchema = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
]);
export const stationSchema = z.object({
  id: z.string().max(80),
  name: z.string().max(80),
  type: z.enum(["H", "S", "R", "C"]),
  point: pointSchema,
  range: z.number().min(10).max(200000),
  height: z.number().min(0.1).max(200),
  battery: z.number().min(0).max(100),
  capacity: z.number().positive().max(10000),
  chargePower: z.number().min(0).max(1000),
  classification: z.literal("simulated"),
});
export type Station = z.infer<typeof stationSchema>;
export const profileSchema = z.object({
  speed: z.number().min(0.1).max(100),
  capacity: z.number().min(0.1).max(10000),
  consumption: z.number().min(0.001).max(100),
  climb: z.number().min(0).max(10),
  reserve: z.number().min(0).max(90),
  initial: z.number().min(1).max(100),
  evaHours: z.number().min(0.1).max(100),
  returnReserve: z.number().min(0).max(90),
  radiation: z.number().min(0).max(1000),
  maxSlope: z.number().min(1).max(60),
});
export const missionSchema = z.object({
  schemaVersion: z.literal(1),
  region: z.enum(["mars", "khermen", "tsagaan"]),
  laboratory: z.boolean(),
  mode: z.enum(["rover", "walk"]),
  waypoints: z.array(pointSchema).max(200),
  route: z.array(pointSchema).max(30000),
  stations: z.array(stationSchema).max(300),
  profile: profileSchema,
  layers: z.record(z.string(), z.boolean()),
  dust: z.enum(["clear", "regional", "local", "widespread"]),
  elapsed: z.number().min(0).max(1e9),
  speed: z.number().min(1).max(10000),
});
export type Mission = z.infer<typeof missionSchema>;
export const defaultProfile = {
  speed: 8,
  capacity: 80,
  consumption: 0.6,
  climb: 0.002,
  reserve: 20,
  initial: 100,
  evaHours: 6,
  returnReserve: 30,
  radiation: 0.02,
  maxSlope: 20,
};
export function makeStation(
  point: Point,
  type: Station["type"],
  i: number,
): Station {
  return {
    id: crypto.randomUUID(),
    name: `URT-${type} ${String(i + 1).padStart(2, "0")}`,
    point,
    type,
    range: 5000,
    height: 3,
    battery: 100,
    capacity: type === "C" ? 100 : 1,
    chargePower: type === "C" ? 5 : 0,
    classification: "simulated",
  };
}
export function deploy(route: Point[], body: Body, spacing: number): Station[] {
  if (route.length < 2) return [];
  const d = length(route, body),
    n = Math.min(200, Math.ceil(d / Math.max(spacing, 100)));
  return Array.from({ length: n + 1 }, (_, i) =>
    makeStation(
      interpolate(route, Math.min(d, (i * d) / n), body),
      i === 0 ? "H" : "R",
      i,
    ),
  );
}
export function link(a: Station, b: Station, body: Body, g: Grid | null) {
  const d = distance(a.point, b.point, body);
  if (d > Math.min(a.range, b.range)) return "Beyond range";
  if (!g) return "Unknown terrain";
  const z1 = elevation(g, a.point),
    z2 = elevation(g, b.point);
  if (z1 === null || z2 === null) return "Unknown terrain";
  const radius = body === "mars" ? 3389500 : 6371008.8;
  for (let i = 1; i < 64; i++) {
    const t = i / 64,
      p: Point = [
        a.point[0] + (b.point[0] - a.point[0]) * t,
        a.point[1] + (b.point[1] - a.point[1]) * t,
      ],
      z = elevation(g, p);
    if (z === null) return "Unknown terrain";
    if (
      z + (d * d * t * (1 - t)) / (2 * radius) >
      (z1 + a.height) * (1 - t) + (z2 + b.height) * t
    )
      return "Terrain obstructed";
  }
  return "Model clear";
}
export function network(stations: Station[], body: Body, g: Grid | null) {
  const links = stations.flatMap((a, i) =>
    stations
      .slice(i + 1)
      .map((b) => ({ a: a.id, b: b.id, status: link(a, b, body, g) })),
  );
  const reached = new Set(
    stations.filter((s) => s.type === "H").map((s) => s.id),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of links)
      if (
        l.status === "Model clear" &&
        (reached.has(l.a) || reached.has(l.b)) &&
        (!reached.has(l.a) || !reached.has(l.b))
      ) {
        reached.add(l.a);
        reached.add(l.b);
        changed = true;
      }
  }
  return {
    links,
    disconnected: stations.filter((s) => !reached.has(s.id)).length,
  };
}
export function energy(
  distanceM: number,
  gain: number,
  profile: Mission["profile"],
) {
  return (distanceM / 1000) * profile.consumption + gain * profile.climb;
}
export function simulation(
  route: Point[],
  body: Body,
  g: Grid | null,
  p: Mission["profile"],
  elapsed: number,
) {
  const total = length(route, body);
  let remaining = Math.min(total, (elapsed * p.speed) / 3.6),
    usedDistance = 0,
    gain = 0;
  for (let i = 1; i < route.length && remaining > 0; i++) {
    const d = distance(route[i - 1], route[i], body),
      part = Math.min(d, remaining),
      z1 = g ? elevation(g, route[i - 1]) : null,
      z2 = g ? elevation(g, route[i]) : null;
    if (z1 !== null && z2 !== null && d > 0)
      gain += (Math.max(0, z2 - z1) * part) / d;
    usedDistance += part;
    remaining -= part;
  }
  const used = energy(usedDistance, gain, p),
    battery = Math.max(0, p.initial - (used / p.capacity) * 100);
  return {
    position: interpolate(route, usedDistance, body),
    distance: usedDistance,
    battery,
    used,
    complete: usedDistance >= total,
  };
}
export function telemetry(s: Station, t: number) {
  const seed = [...s.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    temperature: (-40 + 5 * Math.sin(seed + Math.floor(t / 60) / 10)).toFixed(
      1,
    ),
    battery: Math.max(0, s.battery - (t / 86400) * 3).toFixed(1),
    uncertainty: "Synthetic values; no deployed sensor",
  };
}
