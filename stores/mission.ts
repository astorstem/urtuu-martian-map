import { create } from "zustand";
import { type Mission, missionSchema, defaultProfile } from "@/lib/mission";
import { type Grid } from "@/lib/terrain";
import { type Point } from "@/lib/geo";
export const initialMission = (): Mission => ({
  schemaVersion: 1,
  region: "mars",
  laboratory: false,
  mode: "rover",
  waypoints: [],
  route: [],
  stations: [],
  profile: { ...defaultProfile },
  layers: {
    optical: true,
    hillshade: false,
    thermal: false,
    elevation: false,
    slope: false,
    targets: true,
    stations: true,
    links: true,
    coverage: false,
    dust: true,
    route: true,
  },
  dust: "clear",
  elapsed: 0,
  speed: 120,
});
type State = {
  mission: Mission;
  grid: Grid | null;
  playing: boolean;
  view: "2d" | "3d";
  tool: "inspect" | "waypoint" | "station";
  stationType: "H" | "S" | "R" | "C";
  selected: string | null;
  cursor: Point | null;
  notice: string;
  patch: (m: Partial<Mission>) => void;
  set: (s: Partial<Omit<State, "patch" | "set" | "restore">>) => void;
  restore: (raw: unknown) => void;
};
export const useMission = create<State>((set) => ({
  mission: initialMission(),
  grid: null,
  playing: false,
  view: "2d",
  tool: "inspect",
  stationType: "R",
  selected: null,
  cursor: null,
  notice: "Select waypoints to begin. All plans require field validation.",
  patch: (m) =>
    set((s) => ({
      mission: { ...s.mission, ...m },
      ...(m.route || m.region || m.profile ? { playing: false } : {}),
    })),
  set: (s) => set(s),
  restore: (raw) => {
    const mission = missionSchema.parse(raw);
    set((s) => ({
      mission,
      playing: false,
      selected: null,
      grid:
        s.mission.region === mission.region &&
        s.mission.laboratory === mission.laboratory
          ? s.grid
          : null,
    }));
  },
}));
