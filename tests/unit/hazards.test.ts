import { describe, it, expect } from "vitest";
import { dustHazard, intersectsHazard } from "../../lib/hazards";
import { initialMission } from "../../stores/mission";
describe("deterministic dust geometry", () => {
  it("triggers, moves and resets without random observations", () => {
    const m = initialMission();
    m.waypoints = [
      [-121, -6.31],
      [-120.98, -6.31],
    ];
    m.route = [...m.waypoints];
    expect(dustHazard(m)).toBeUndefined();
    m.dust = "local";
    expect(intersectsHazard(m)).toBe(true);
    const initial = dustHazard(m)!;
    expect(dustHazard({ ...m, elapsed: 3600 })!.center[0]).toBeGreaterThan(
      initial.center[0],
    );
    expect(dustHazard({ ...m, elapsed: 0 })).toEqual(initial);
    expect(dustHazard({ ...m, dust: "widespread" })!.radius).toBeGreaterThan(
      initial.radius,
    );
  });
});
