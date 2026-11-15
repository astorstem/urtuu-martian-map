export type Point = [number, number];
export type Body = "mars" | "earth";
export const bodies = {
  mars: {
    radius: 3389500,
    crs: "URTUU:MARS_EQ",
    latitude: "planetocentric",
    datum: "MOLA areoid",
    name: "Mars",
  },
  earth: {
    radius: 6371008.8,
    crs: "EPSG:4326",
    latitude: "geodetic WGS84",
    datum: "EGM2008 (Copernicus)",
    name: "Earth",
  },
};
export const normalizeLongitude = (x: number) =>
  ((((x + 180) % 360) + 360) % 360) - 180;
export function distance(a: Point, b: Point, body: Body) {
  const r = Math.PI / 180,
    p = (b[1] - a[1]) * r,
    l = (b[0] - a[0]) * r;
  const h =
    Math.sin(p / 2) ** 2 +
    Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(l / 2) ** 2;
  return 2 * bodies[body].radius * Math.asin(Math.min(1, Math.sqrt(h)));
}
export function length(points: Point[], body: Body) {
  return points
    .slice(1)
    .reduce((n, p, i) => n + distance(points[i], p, body), 0);
}
export function interpolate(
  points: Point[],
  meters: number,
  body: Body,
): Point {
  if (!points.length) return [0, 0];
  for (let i = 1; i < points.length; i++) {
    const d = distance(points[i - 1], points[i], body);
    if (meters <= d) {
      const t = d ? Math.max(0, meters / d) : 0;
      return [
        points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t,
        points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t,
      ];
    }
    meters -= d;
  }
  return points[points.length - 1];
}
export const targets = [
  {
    name: "Annie",
    published: [240.03, -6.52] as Point,
    point: [-119.97, -6.52] as Point,
    elevation: 11055,
  },
  {
    name: "Dena",
    published: [239.02, -6.31] as Point,
    point: [-120.98, -6.31] as Point,
    elevation: 9100,
  },
  {
    name: "Chloë",
    published: [239.21, -4.29] as Point,
    point: [-120.79, -4.29] as Point,
    elevation: 5700,
  },
];
export const regions = {
  mars: {
    name: "Arsia Mons",
    code: "MARS–01",
    body: "mars" as Body,
    center: [-120.98, -6.31] as Point,
    span: 0.12,
  },
  khermen: {
    name: "Khermen Tsav",
    code: "MG–01",
    body: "earth" as Body,
    center: [99.83337, 43.47442] as Point,
    span: 0.04,
  },
  tsagaan: {
    name: "Tsagaan Suvarga",
    code: "MG–02",
    body: "earth" as Body,
    center: [105.71726, 44.57687] as Point,
    span: 0.035,
  },
};
export type Region = keyof typeof regions;
