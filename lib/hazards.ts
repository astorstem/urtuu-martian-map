import { bodies, regions, distance, type Point } from "./geo";
import type { Mission } from "./mission";
export function dustHazard(m: Mission) {
  if (m.dust === "clear") return undefined;
  const r = regions[m.region],
    origin = m.waypoints[1] ?? r.center;
  const radius =
    ((r.span * Math.PI) / 180) *
    bodies[r.body].radius *
    (m.dust === "widespread" ? 1 : 0.22);
  const drift = Math.min(m.elapsed / 3600, 3) * radius * 0.15;
  const center: Point = [
    origin[0] +
      ((drift / bodies[r.body].radius) * 180) /
        Math.PI /
        Math.cos((origin[1] * Math.PI) / 180),
    origin[1],
  ];
  return {
    center,
    radius,
    severity:
      m.dust === "widespread"
        ? 1
        : m.dust === "regional"
          ? Math.min(1, 0.25 + m.elapsed / 14400)
          : 0.6,
  };
}
export function intersectsHazard(m: Mission) {
  const h = dustHazard(m);
  if (!h) return false;
  const body = regions[m.region].body;
  return m.route.some((p, i) => {
    if (distance(p, h.center, body) <= h.radius) return true;
    if (!i) return false;
    const a = m.route[i - 1];
    for (let j = 1; j < 32; j++) {
      const t = j / 32;
      if (
        distance(
          [a[0] + (p[0] - a[0]) * t, a[1] + (p[1] - a[1]) * t],
          h.center,
          body,
        ) <= h.radius
      )
        return true;
    }
    return false;
  });
}
