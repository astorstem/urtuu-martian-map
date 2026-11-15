"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useMission } from "@/stores/mission";
import { cellPoint, elevation } from "@/lib/terrain";
import { distance, type Point, regions } from "@/lib/geo";
export default function Terrain() {
  const host = useRef<HTMLDivElement>(null),
    [exaggeration, setExaggeration] = useState(2),
    [fly, setFly] = useState(false);
  const { grid, mission } = useMission();
  useEffect(() => {
    if (!host.current || !grid) return;
    const mount = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      mount.textContent =
        "WebGL unavailable. Use the 2D map to continue planning.";
      return;
    }
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#101c22");
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000000),
      controls = new OrbitControls(camera, renderer.domElement);
    mount.appendChild(renderer.domElement);
    const center: Point = [
        (grid.bounds[0] + grid.bounds[2]) / 2,
        (grid.bounds[1] + grid.bounds[3]) / 2,
      ],
      base = Math.min(...grid.values.filter((v): v is number => v !== null));
    const xyz = (p: Point, z: number) =>
      new THREE.Vector3(
        distance([center[0], p[1]], p, grid.body) * Math.sign(p[0] - center[0]),
        (z - base) * exaggeration,
        distance([p[0], center[1]], p, grid.body) *
          -Math.sign(p[1] - center[1]),
      );
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const max = Math.max(...grid.values.filter((v): v is number => v !== null));
    grid.values.forEach((z, i) => {
      const v = xyz(
        cellPoint(grid, i % grid.width, Math.floor(i / grid.width)),
        z ?? base,
      );
      positions.push(v.x, v.y, v.z);
      const c = new THREE.Color().setHSL(
        0.065,
        0.22,
        0.22 + (((z ?? base) - base) / (max - base || 1)) * 0.27,
      );
      colors.push(c.r, c.g, c.b);
    });
    for (let y = 0; y < grid.height - 1; y++)
      for (let x = 0; x < grid.width - 1; x++) {
        const i = y * grid.width + x;
        if (
          [i, i + 1, i + grid.width, i + grid.width + 1].every(
            (k) => grid.values[k] !== null,
          )
        )
          indices.push(
            i,
            i + grid.width,
            i + 1,
            i + 1,
            i + grid.width,
            i + grid.width + 1,
          );
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    scene.add(
      new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
          roughness: 0.95,
        }),
      ),
    );
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const light = new THREE.DirectionalLight(0xffd5aa, 2);
    light.position.set(-2000, 5000, 1000);
    scene.add(light);
    const size = distance(
      [grid.bounds[0], center[1]],
      [grid.bounds[2], center[1]],
      grid.body,
    );
    camera.position.set(size * 0.6, size * 0.8, size * 0.8);
    controls.target.set(0, ((max - base) * exaggeration) / 2, 0);
    controls.update();
    const route = mission.route
      .map((p) => {
        const z = elevation(grid, p);
        return z === null
          ? null
          : xyz(p, z).add(new THREE.Vector3(0, size / 500, 0));
      })
      .filter((p): p is THREE.Vector3 => p !== null);
    if (route.length > 1)
      scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(route),
          new THREE.LineBasicMaterial({ color: 0xffbd7a }),
        ),
      );
    for (const s of mission.stations) {
      const z = elevation(grid, s.point);
      if (z === null) continue;
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(size / 150, size / 55, 8),
        new THREE.MeshStandardMaterial({ color: 0x96d2c8 }),
      );
      marker.position.copy(xyz(s.point, z));
      scene.add(marker);
    }
    const resize = () => {
      const w = mount.clientWidth,
        h = mount.clientHeight;
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();
    let frame = 0,
      start = performance.now();
    const animate = () => {
      if (fly && route.length > 1) {
        const t = ((performance.now() - start) / 20000) % 1,
          index = Math.floor(t * (route.length - 1));
        camera.position
          .copy(route[index])
          .add(new THREE.Vector3(size / 10, size / 8, size / 10));
        controls.target.copy(route[Math.min(index + 2, route.length - 1)]);
      }
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m: THREE.Material) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      start = 0;
    };
  }, [grid, mission.route, mission.stations, exaggeration, fly]);
  return (
    <div className="terrain-wrap">
      {grid ? (
        <>
          <div ref={host} className="terrain-canvas" />
          <div className="terrain-controls">
            <label>
              Vertical exaggeration ×{exaggeration}
              <input
                aria-label="Vertical exaggeration"
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={exaggeration}
                onChange={(e) => setExaggeration(+e.target.value)}
              />
            </label>
            <button onClick={() => setFly(!fly)}>
              {fly ? "Stop flyover" : "Route flyover"}
            </button>
            <span>
              {grid.classification === "simulated"
                ? "SYNTHETIC LAB TERRAIN"
                : "NUMERICAL DEM"}{" "}
              · elevation colors, no image texture
            </span>
          </div>
        </>
      ) : (
        <div className="empty-terrain">
          <span className="eyebrow">TERRAIN DATA REQUIRED</span>
          <h2>No numerical DEM for {regions[mission.region].name}</h2>
          <p>
            Prepare a sourced regional grid to enable 3D and terrain routing.
            The 2D map remains available.
          </p>
          <p>
            The laboratory switch loads clearly labeled synthetic terrain for
            demonstrating the algorithms.
          </p>
        </div>
      )}
    </div>
  );
}
