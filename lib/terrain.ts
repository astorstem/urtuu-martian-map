import { distance, type Body, type Point } from "./geo";
export type Grid = {
  width: number;
  height: number;
  bounds: [number, number, number, number];
  values: (number | null)[];
  body: Body;
  classification: "derived" | "simulated";
  source: string;
  resolution: string;
  datum: string;
};
export function cellPoint(g: Grid, x: number, y: number): Point {
  return [
    g.bounds[0] + (x / (g.width - 1)) * (g.bounds[2] - g.bounds[0]),
    g.bounds[3] - (y / (g.height - 1)) * (g.bounds[3] - g.bounds[1]),
  ];
}
export function cell(g: Grid, p: Point) {
  return [
    Math.round(
      ((p[0] - g.bounds[0]) / (g.bounds[2] - g.bounds[0])) * (g.width - 1),
    ),
    Math.round(
      ((g.bounds[3] - p[1]) / (g.bounds[3] - g.bounds[1])) * (g.height - 1),
    ),
  ];
}
export function elevation(g: Grid, p: Point) {
  const [x, y] = cell(g, p);
  return x < 0 || y < 0 || x >= g.width || y >= g.height
    ? null
    : g.values[y * g.width + x];
}
export function slope(g: Grid, x: number, y: number) {
  const z = g.values[y * g.width + x];
  if (z === null) return null;
  let max = 0;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const a = x + dx,
      b = y + dy;
    if (a < 0 || b < 0 || a >= g.width || b >= g.height) continue;
    const v = g.values[b * g.width + a];
    if (v !== null)
      max = Math.max(
        max,
        (Math.atan2(
          Math.abs(v - z),
          distance(cellPoint(g, x, y), cellPoint(g, a, b), g.body),
        ) *
          180) /
          Math.PI,
      );
  }
  return max;
}
export function syntheticGrid(center: Point, span: number, body: Body): Grid {
  const width = 65,
    height = 65,
    values = Array.from({ length: width * height }, (_, i) => {
      const x = i % width,
        y = Math.floor(i / width);
      return Math.round(
        1100 +
          80 * Math.sin(x / 12) * Math.cos(y / 15) +
          110 * Math.exp(-((x - 35) ** 2 + (y - 30) ** 2) / 120),
      );
    });
  return {
    width,
    height,
    bounds: [
      center[0] - span,
      center[1] - span,
      center[0] + span,
      center[1] + span,
    ],
    values,
    body,
    classification: "simulated",
    source:
      "URTUU deterministic synthetic laboratory; not geographic observations",
    resolution: "65 × 65 synthetic samples",
    datum: "arbitrary simulated metres",
  };
}
