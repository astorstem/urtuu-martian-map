import { cell, cellPoint, elevation, slope, type Grid } from "./terrain";
import { distance, length, type Point, type Body } from "./geo";
export type Hazard = { center: Point; radius: number; severity: number };
export type RoutingOptions = {
  maxSlope: number;
  slopeWeight: number;
  hazard?: Hazard;
};
// Binary min heap keeps A* responsive on bounded grids.
class Heap {
  a: { i: number; f: number }[] = [];
  push(v: { i: number; f: number }) {
    this.a.push(v);
    let n = this.a.length - 1;
    while (n) {
      const p = (n - 1) >> 1;
      if (this.a[p].f <= v.f) break;
      this.a[n] = this.a[p];
      n = p;
    }
    this.a[n] = v;
  }
  pop() {
    const r = this.a[0],
      v = this.a.pop()!;
    if (this.a.length) {
      let n = 0;
      while (n * 2 + 1 < this.a.length) {
        let c = n * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1].f < this.a[c].f) c++;
        if (v.f <= this.a[c].f) break;
        this.a[n] = this.a[c];
        n = c;
      }
      this.a[n] = v;
    }
    return r;
  }
}
export function astar(
  g: Grid,
  start: Point,
  end: Point,
  opt: RoutingOptions,
): Point[] {
  const [sx, sy] = cell(g, start),
    [ex, ey] = cell(g, end);
  const valid = (x: number, y: number) =>
    x >= 0 &&
    y >= 0 &&
    x < g.width &&
    y < g.height &&
    g.values[y * g.width + x] !== null &&
    (slope(g, x, y) ?? Infinity) <= opt.maxSlope;
  if (!valid(sx, sy) || !valid(ex, ey))
    throw Error(
      "Endpoints are outside valid DEM coverage or exceed the slope limit.",
    );
  const first = sy * g.width + sx,
    last = ey * g.width + ex,
    cost = new Float64Array(g.values.length).fill(Infinity),
    prev = new Int32Array(g.values.length).fill(-1),
    closed = new Set<number>(),
    heap = new Heap();
  cost[first] = 0;
  heap.push({ i: first, f: 0 });
  while (heap.a.length) {
    const { i } = heap.pop();
    if (closed.has(i)) continue;
    if (i === last) {
      const route: Point[] = [];
      for (let k = last; k !== -1; k = prev[k])
        route.push(cellPoint(g, k % g.width, Math.floor(k / g.width)));
      return route.reverse();
    }
    closed.add(i);
    const x = i % g.width,
      y = Math.floor(i / g.width),
      p = cellPoint(g, x, y);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx,
          ny = y + dy;
        if (
          !valid(nx, ny) ||
          (dx && dy && (!valid(x + dx, y) || !valid(x, y + dy)))
        )
          continue;
        const j = ny * g.width + nx,
          q = cellPoint(g, nx, ny),
          d = distance(p, q, g.body),
          rise = Math.abs(g.values[j]! - g.values[i]!);
        if ((Math.atan2(rise, d) * 180) / Math.PI > opt.maxSlope) continue;
        const hazard =
          opt.hazard &&
          distance(q, opt.hazard.center, g.body) < opt.hazard.radius
            ? opt.hazard.severity * 40
            : 0;
        const next =
          cost[i] +
          d * (1 + (opt.slopeWeight * rise) / d + hazard) +
          Math.max(0, g.values[j]! - g.values[i]!) * 3;
        if (next < cost[j]) {
          cost[j] = next;
          prev[j] = i;
          heap.push({
            i: j,
            f: next + distance(q, cellPoint(g, ex, ey), g.body),
          });
        }
      }
  }
  throw Error(
    "No feasible route under these model assumptions. Consider delaying or revising the scenario.",
  );
}
export function routeStats(points: Point[], body: Body, g: Grid | null) {
  let gain = 0,
    loss = 0,
    maxSlope = 0,
    known = !!g;
  for (let i = 1; i < points.length; i++) {
    const a = g ? elevation(g, points[i - 1]) : null,
      b = g ? elevation(g, points[i]) : null;
    if (a === null || b === null) {
      known = false;
      continue;
    }
    gain += Math.max(0, b - a);
    loss += Math.max(0, a - b);
    maxSlope = Math.max(
      maxSlope,
      (Math.atan2(Math.abs(b - a), distance(points[i - 1], points[i], body)) *
        180) /
        Math.PI,
    );
  }
  return {
    distance: length(points, body),
    gain: known ? gain : null,
    loss: known ? loss : null,
    maxSlope: known ? maxSlope : null,
  };
}
