"use client";

/**
 * The HH Goa night beach in 3D, arranged to match the flat illustration:
 * moon low on the horizon with a reflection down the water, headland either
 * side, palms framing the foreground, shacks and props on the sand.
 *
 * Everything is optional. With no GLBs present it still renders a complete
 * scene from primitives; each model that lands upgrades one layer of it. The
 * camera is driven by `progress` (0..1) written from ScrollTrigger, never React
 * state, so scrubbing costs no re-renders.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { MODELS, type Credit, type Slot } from "@/lib/models";

const YELLOW = new THREE.Color("#fee13c");
const PINK = new THREE.Color("#ff0080");
const SEA = new THREE.Color("#2f7fae");
const INK = new THREE.Color("#0B6839");

/* ---------------------------------------------------------------- assets */

// Slot list, model files and attribution live in lib/models so the footer can
// credit them without importing this module and all of three.js with it. Passed
// straight back out: everything downstream already imports them from here.
export { MODELS };
export type { Slot, Credit };

/**
 * The file for a slot, or undefined if that slot has no model and the layer
 * stays procedural. MODELS is the switch: a slot listed there is a slot that
 * renders. There used to be a HEAD probe here confirming each file existed,
 * which cost a full round trip after the chunk mounted before the first byte
 * of any model was requested. The entry in lib/models says the same thing for
 * free.
 */
const fileFor = (s: Slot) => MODELS.find((m) => m.slot === s)?.file;

/* ------------------------------------------------------------- placement */

/**
 * Scale an arbitrary model to a known size and plant it on its own base, so a
 * model of any authored scale lands correctly without manual transforms.
 */
function place(obj: THREE.Object3D, target: number, axis: "y" | "x" | "z", onBase = true) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const ref = axis === "y" ? size.y : axis === "x" ? Math.max(size.x, size.z) : size.z;
  const s = target / (ref || 1);
  obj.scale.setScalar(s);
  obj.position.set(-centre.x * s, onBase ? -box.min.y * s : -centre.y * s, -centre.z * s);
  return obj;
}

function useCopies(url: string, n: number, target: number, axis: "y" | "x" = "y") {
  const { scene } = useGLTF(url);
  return useMemo(
    () => Array.from({ length: n }, () => place(scene.clone(true), target, axis)),
    [scene, n, target, axis],
  );
}

/* --------------------------------------------------------------- layers */

/** The artwork's sky band, seated on the horizon. */
const SEA_W = 460;      // sea span across X: runs past both edges of frame
const SEA_D = 200;      // sea span in Z: reaches the sky plate, so they touch
const SKY_D = SEA_D + 6; // sky sits just beyond the sea's far edge
// The photo occupies SKY_IMG_W; the plane is far wider than that and the extra
// is filled by the texture's clamped edge pixels, which is why widening costs
// nothing here. Simply stretching the plate to cover the frame would smear the
// sun into an oval, and any finite plate has an edge the camera can eventually
// see past. Padding with clamped edge columns has neither problem: the image
// keeps its proportions in the middle and the sides run out in its own colours.
const SKY_TOP = 141;    // world height of the band above y = 0
const SKY_IMG_W = 900;  // world width of the photo itself; the sun maps against this
const SKY_W = 2400;     // plane width, ~80 degrees from anywhere on the path
// The plate sits 6 units behind the sea's far edge, so its y = 0 line lands
// slightly above the horizon and leaves a seam. Hang it below the waterline;
// the sea draws over the overhang.
const SKY_DROP = 3;

// The wave model is fitted with its highest crest on y = 0, so the surface a
// floating object actually rests on is roughly half a swell below that. Anything
// standing in open water is seated here, not on y = 0, or it hovers.
const SWELL = 5.4; // cap on wave height: the one knob for how choppy the sea reads
const SEA_LEVEL = -SWELL / 2;

function SkyImage() {
  const src = useLoader(THREE.TextureLoader, "/sunset.jpg");
  const map = useMemo(() => {
    // Clone: the loader caches and shares this texture, so configuring the
    // instance we were handed would mutate a value owned by the hook.
    const t = src.clone();
    t.colorSpace = THREE.SRGBColorSpace;
    // Repeat > 1 with clamped wrapping: UVs run outside 0..1 at the sides, and
    // clamping holds the edge column there, so the photo sits at its own width
    // in the middle and its outermost pixels run out to the ends of the plane.
    t.wrapS = THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.x = SKY_W / SKY_IMG_W;
    t.offset.x = (1 - t.repeat.x) / 2;
    t.needsUpdate = true;
    return t;
  }, [src]);
  useEffect(() => () => map.dispose(), [map]);

  return (
    <mesh position={[0, (SKY_TOP - SKY_DROP) / 2, -SKY_D]} renderOrder={-1}>
      <planeGeometry args={[SKY_W, SKY_TOP + SKY_DROP]} />
      <meshBasicMaterial map={map} depthWrite={false} fog={false} toneMapped={false} />
    </mesh>
  );
}

/** Night sky: a huge inverted sphere with a vertical gradient, plus stars. */
function Sky() {
  const stars = useMemo(() => {
    // Seeded, so the sky is identical on every render and between server and
    // client rather than reshuffling.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const y = rand() * 0.75 + 0.12;
      const r = 78;
      pos[i * 3] = Math.cos(a) * r * Math.sqrt(1 - y * y);
      pos[i * 3 + 1] = y * r;
      pos[i * 3 + 2] = Math.sin(a) * r * Math.sqrt(1 - y * y);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  return (
    <>
      <points geometry={stars}>
        <pointsMaterial size={0.32} color="#cfeee0" sizeAttenuation transparent opacity={0.75} />
      </points>
    </>
  );
}

/** The moon low on the water, with the ladder of reflections from the artwork. */
function Moon() {
  const glow = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const rg = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    rg.addColorStop(0, "rgba(254,225,60,0.95)");
    rg.addColorStop(0.35, "rgba(254,225,60,0.28)");
    rg.addColorStop(1, "rgba(254,225,60,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);

  const bars = useMemo(
    () => [
      [0, 3.0, 0.26], [0.5, 4.1, 0.18], [-0.35, 5.2, 0.22],
      [0.7, 6.4, 0.15], [-0.55, 7.6, 0.13], [0.3, 8.9, 0.1],
    ] as const,
    [],
  );

  return (
    <group position={[0, 0, -46]}>
      <mesh position={[0, 6.4, 0]}>
        <circleGeometry args={[4.2, 48]} />
        <meshBasicMaterial color={YELLOW} toneMapped={false} />
      </mesh>
      <sprite position={[0, 6.4, -0.4]} scale={[17, 17, 1]}>
        <spriteMaterial map={glow} transparent depthWrite={false} />
      </sprite>
      {bars.map(([x, z, w], i) => (
        <mesh key={i} position={[x, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.2 - i * 0.6, w]} />
          <meshBasicMaterial color={YELLOW} transparent opacity={0.34 - i * 0.045} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Procedural sea, replaced by the animated GLB when water.glb is present. */
function Sea({ url, still }: { url?: string; still: boolean }) {
  const geo = useRef<THREE.PlaneGeometry>(null);
  const base = useRef<Float32Array | null>(null);

  useFrame((state) => {
    if (still || url || !geo.current) return;
    const attr = geo.current.attributes.position as THREE.BufferAttribute;
    if (!base.current) base.current = Float32Array.from(attr.array as Float32Array);
    const t = state.clock.elapsedTime;
    for (let i = 0; i < attr.count; i++) {
      const x = base.current[i * 3];
      const y = base.current[i * 3 + 1];
      attr.setZ(i, Math.sin(x * 0.35 + t * 0.9) * 0.11 + Math.cos(y * 0.5 + t * 0.6) * 0.08);
    }
    attr.needsUpdate = true;
    geo.current.computeVertexNormals();
  });

  if (url) return <SeaModel url={url} still={still} />;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -18]} receiveShadow>
      <planeGeometry ref={geo} args={[180, 120, 90, 60]} />
      <meshStandardMaterial color={SEA} roughness={0.22} metalness={0.5} />
    </mesh>
  );
}

function SeaModel({ url, still }: { url: string; still: boolean }) {
  const { scene, animations } = useGLTF(url);
  const host = useRef<THREE.Group>(null);
  const model = useMemo(() => scene.clone(true), [scene]);
  const { actions } = useAnimations(animations, host);

  // The clip animates the model's own transform, so anything written onto the
  // object itself is overwritten every frame - which is why the sea kept
  // ignoring its scale and leaving a hole. Fit on wrapper groups instead:
  // outer carries position + scale, middle carries rotation, the animated
  // model sits untouched inside.
  const fit = useMemo(() => {
    const probe = model.clone(true);
    const candidates: [number, number, number][] = [
      [0, 0, 0],
      [-Math.PI / 2, 0, 0],
      [0, 0, Math.PI / 2],
    ];
    let rot = candidates[0];
    let best = Infinity;
    for (const r of candidates) {
      probe.rotation.set(r[0], r[1], r[2]);
      probe.updateMatrixWorld(true);
      const sz = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3());
      const ratio = sz.y / Math.max(1e-6, Math.max(sz.x, sz.z));
      if (ratio < best) {
        best = ratio;
        rot = r;
      }
    }
    probe.rotation.set(rot[0], rot[1], rot[2]);
    probe.position.set(0, 0, 0);
    probe.scale.setScalar(1);
    probe.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(probe);
    const raw = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const sx = SEA_W / (raw.x || 1);
    const sz = SEA_D / (raw.z || 1);
    const sy = Math.min(sx, sz, raw.y > 1e-3 ? SWELL / raw.y : sx);

    return {
      rot,
      scale: [sx, sy, sz] as [number, number, number],
      // centre on X, surface on y = 0, near edge on z = 0
      pos: [-ctr.x * sx, -box.max.y * sy, -box.max.z * sz] as [number, number, number],
    };
  }, [model]);

  useMemo(() => {
    model.traverse((n) => {
      const mesh = n as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mesh.isMesh || !mat || !mat.color) return;
      const next = mat.clone();
      // Keep the ripple map: nulling it leaves a flat rectangle of colour.
      next.color.set("#1f6f9e");
      next.roughness = 0.28;
      next.metalness = 0.35;
      mesh.material = next;
    });
  }, [model]);

  useEffect(() => {
    if (still) return;
    const acts = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    acts.forEach((a) => {
      a.timeScale = 1.35; // faster swell, so the bigger waves still move like water
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
    });
    return () => acts.forEach((a) => a.stop());
  }, [actions, still]);

  return (
    <group ref={host} position={fit.pos} scale={fit.scale}>
      <group rotation={fit.rot}>
        <primitive object={model} />
      </group>
    </group>
  );
}

/** Sand shelf. A GLB replaces the plain shelf when sand.glb lands. */
function SandModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const m = scene.clone(true);
    m.position.set(0, 0, 0);
    m.scale.setScalar(1);
    m.updateMatrixWorld(true);

    const raw = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3());
    const footprint = Math.max(raw.x, raw.z) || 1;
    const s = 130 / footprint;
    // Squash the relief on Y only. Scaling uniformly to cap an island's hills
    // shrinks the whole beach to a pebble, which is what put the sand out at
    // sea; a separate Y scale keeps the footprint and flattens the terrain.
    const sy = raw.y ? Math.min(s, 1.8 / raw.y) : s;
    m.scale.set(s, sy, s);
    m.updateMatrixWorld(true);

    // Centre and seat only AFTER the final scale, or the offset is stale.
    const box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    m.position.set(-c.x, -box.min.y, -c.z);

    // Ships as grey rock. Tint toward sand but KEEP the maps: stripping them
    // leaves one flat plastic slab, which is what read as fake.
    m.traverse((n) => {
      const mesh = n as THREE.Mesh;
      const mat = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (!mesh.isMesh || !mat || !mat.color) return;
      const next = mat.clone();
      next.color.set("#e9e3c8");
      next.roughness = 1;
      next.metalness = 0;
      mesh.material = next;
    });
    return m;
  }, [scene]);

  // Slide the shelf forward so its seaward edge meets the waterline at z = 0.
  const depth = useMemo(() => {
    const b = new THREE.Box3().setFromObject(model);
    return b.max.z - b.min.z;
  }, [model]);

  return (
    <group name={GROUND} position={[0, -0.9, depth / 2 - 4.4]}>
      <primitive object={model} />
    </group>
  );
}

/** Name on whatever is acting as the beach, so figures can find it to stand on. */
const GROUND = "ground";

function Sand({ url }: { url?: string }) {
  if (url) return <SandModel url={url} />;
  return (
    // Kept behind the shoreline (z 0..44) so the camera flies over water, not
    // through a slab of sand, and the sea stays the dominant surface.
    <mesh name={GROUND} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 22]} receiveShadow>
      <planeGeometry args={[150, 44]} />
      <meshStandardMaterial color="#f2f6e4" roughness={0.95} />
    </mesh>
  );
}

/** Palms framing the shot, exactly as the flat illustration frames it. */
function Palms({ url }: { url: string }) {
  const trees = useCopies(url, 8, 9);
  const hosts = useRef<THREE.Group[]>([]);
  // Reference framing: two tall palms hard against the left and right edges,
  // the rest scattered back along the shore. Every z stays > 0: the sand runs
  // z 0..44 and anything past the waterline stands in the sea.
  const spots = useMemo(
    () => [
      [-21, 0, 24, 1.5], [22, 0, 23, 1.45],
      [-13, 0, 14.5, 1.0], [14, 0, 14, 1.05],
      [-4.5, 0, 9, 0.72], [9, 0, 11, 0.78],
      [-18, 0, 9, 0.85], [19, 0, 8.6, 0.8],
    ] as const,
    [],
  );

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    hosts.current.forEach((g, i) => {
      if (!g) return;
      // 1.3 degrees is invisible on a 9-unit tree. Bend it properly, and give
      // each palm its own phase and speed so the grove is not in lockstep.
      const ph = i * 1.7;
      const sp = 0.55 + (i % 3) * 0.12;
      g.rotation.z = Math.sin(t * sp + ph) * 0.055;
      g.rotation.x = Math.cos(t * sp * 0.8 + ph) * 0.028;
    });
  });

  return (
    <group>
      {trees.map((tree, i) => {
        const [x, y, z, s] = spots[i];
        return (
          <group
            key={i}
            ref={(el) => {
              if (el) hosts.current[i] = el;
            }}
            position={[x, y, z]}
            scale={[x < 0 ? s : -s, s, s]}
          >
            <primitive object={tree} />
          </group>
        );
      })}
    </group>
  );
}

/**
 * The girl, standing where the left beach kit used to be. Her clip is a walk
 * loop and she does not travel, so it runs slowed right down: the model reads
 * as a posed figure shifting her weight rather than a bind pose or a mime.
 */
function Girl({
  url, still, spot, scale,
}: {
  url: string;
  still: boolean;
  /** x, z, y-rotation. Kept at the call site like every Cluster's spots. */
  spot: readonly [number, number, number];
  scale: number;
}) {
  const host = useRef<THREE.Group>(null);
  // No clone, and no place(). Object3D.clone leaves a skinned copy bound to the
  // original skeleton, so the clip would drive bones the visible mesh ignores;
  // and place() reads the file's Tooth mesh, whose bind-pose box runs to -15087
  // on Y against 2.0 for every other mesh, which shrinks her to a speck. She is
  // a single instance, so the loaded scene is used as-is and scaled by hand:
  // her meshes stand 2.0 units tall, so scale is her height halved.
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, host);

  useEffect(() => {
    const acts = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    acts.forEach((a) => {
      a.reset().setLoop(THREE.LoopRepeat, Infinity).play();
      a.timeScale = still ? 0 : 0.2;
    });
    return () => acts.forEach((a) => a.stop());
  }, [actions, still]);

  // Her feet sit on y = 0, but sand.glb carries relief, so the ground under her
  // is not the waterline plane and she hangs in the air. Drop a ray onto the
  // beach and stand her on that. Against the beach ONLY, found by name: a plain
  // downward ray through the scene lands on the first thing it meets, which out
  // here was a drooping palm frond at y 2.1. Held in state, not written onto the
  // group: a re-render re-applies position and would strand her again.
  const [groundY, setGroundY] = useState<number | null>(null);
  const tries = useRef(0);
  useFrame(({ scene: world }) => {
    if (groundY !== null || tries.current++ > 60) return;
    const ground = world.getObjectByName(GROUND);
    if (!ground) return; // beach not mounted yet; try again next frame
    // useFrame runs BEFORE the renderer updates world matrices, so on the first
    // frames the beach still measures as if it sat at the origin: the ray then
    // lands about 0.9 high, which is exactly the hover. Bake its transform first.
    ground.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(spot[0], 60, spot[1]),
      new THREE.Vector3(0, -1, 0),
    );
    const hit = ray.intersectObject(ground, true)[0];
    if (hit) setGroundY(hit.point.y);
  });

  return (
    <group
      ref={host}
      position={[spot[0], groundY ?? 0, spot[1]]}
      rotation={[0, spot[2], 0]}
      scale={scale}
    >
      <primitive object={scene} />
    </group>
  );
}

function Cluster({
  url, spots, target, axis = "y", tint, tilt,
}: {
  url: string;
  spots: readonly (readonly [number, number, number, number])[];
  target: number;
  axis?: "y" | "x";
  // A string paints the whole model. A record keyed by the GLB's material names
  // paints only those parts, so a model can keep red walls and a white roof.
  tint?: string | Record<string, string>;
  tilt?: readonly [number, number, number];
}) {
  const copies = useCopies(url, spots.length, target, axis);
  useMemo(() => {
    if (!tint) return;
    for (const o of copies)
      o.traverse((n) => {
        const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!m || !m.color) return;
        const hex = typeof tint === "string" ? tint : tint[m.name];
        if (!hex) return;
        const clone = m.clone();
        clone.color.set(hex);
        clone.map = null;
        clone.roughness = 1;
        clone.metalness = 0;
        (n as THREE.Mesh).material = clone;
      });
  }, [copies, tint]);
  return (
    <group>
      {copies.map((o, i) => {
        const [x, y, z, r] = spots[i];
        return (
          <group
            key={i}
            position={[x, y, z]}
            rotation={[tilt ? tilt[0] : 0, r + (tilt ? tilt[1] : 0), tilt ? tilt[2] : 0]}
          >
            <primitive object={o} />
          </group>
        );
      })}
    </group>
  );
}

/* ---------------------------------------------------------------- camera */

const BASE_FOV = 40;

/**
 * Scroll drives the camera down the beach: the same wide opening as before, a
 * close-up passing on the girl's immediate left, up through the fronds of the
 * big palm beside her, down under the second beach umbrella, then out over the
 * water and a zoom into the sun on the horizon. Keyframes are lerped, so adding
 * a waypoint is a one-line change; `fov` is optional and falls back to BASE_FOV.
 *
 * The sun's world position is read off sunset.jpg: its glow is centred across
 * the image and 93% of the way down, which on the sky plate (900 wide, y -3..141,
 * z -206) puts it at about [4.5, 7, -206]. Re-derive this if the plate resizes.
 */
const PATH: {
  at: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}[] = [
  { at: 0.0, pos: [0, 6.0, 28], look: [0, -10.6, -40] },
  // close-up on her immediate left: she stands at (-3.5, 16.5) and about 2.4
  // tall, so 3.8 out at head height frames her head and shoulders. The camera
  // sits BEHIND her z, not level with it: aiming at a point beside the camera
  // means that the moment it draws level the aim swings through 90 degrees and
  // then points backwards. Approaching from behind keeps her ahead of the lens
  // the whole way in, so the pan is gentle and always forward.
  { at: 0.20, pos: [-5.6, 2.3, 19.9], look: [-3.4, 2.0, 16.6] },
  // through the fronds of the palm standing behind her, at (-4.5, 9): 6.5 units
  // high, so its canopy runs y 4.5..6.5 and spreads about 2.5 off the trunk.
  // Close in on the trunk's left, deeper into the leaves than the canopy edge,
  // and almost straight ahead of the close-up so the leg stays a gentle rise
  { at: 0.45, pos: [-5.4, 5.3, 9.8], look: [-4.2, 4.2, 3] },
  // and down under the second umbrella, the kit at (-4, 2.5). It stands ~2.4
  // tall, so this threads between the sand and the canopy. Two waypoints, lined
  // up on the kit's own x: one going in under the canopy and one still under it
  // on the way out, so the camera spends a beat beneath rather than clipping the
  // edge and leaving
  { at: 0.66, pos: [-4.0, 1.3, 4.6], look: [-3.7, 1.2, -6] },
  { at: 0.80, pos: [-3.8, 1.3, 0.8], look: [-3.2, 1.2, -30] },
  // out over the water, pushed in on the sun: the long lens does the zooming,
  // since at 200 units away moving the camera barely changes its size
  // y 9, not 6.5: the bigger plate lifts the sun to y 7, and the camera has to
  // stay above what it aims at or the shot is pointing up at open sky again
  { at: 1.0, pos: [-1, 9, -14], look: [4.5, 7, -206], fov: 16 },
];

/**
 * Two rules hold for every waypoint, and both have already been broken once:
 * the target must be further down the beach than the camera (look z < pos z) or
 * the camera ends up facing backwards, and it must not sit above the camera
 * (look y <= pos y) or the shot points at open sky. Checked here rather than
 * left as a comment, since the failure only shows up mid-scroll.
 */
if (process.env.NODE_ENV !== "production") {
  for (const k of PATH) {
    if (k.look[2] >= k.pos[2]) console.warn(`PATH ${k.at}: aims backwards`, k);
    if (k.look[1] > k.pos[1]) console.warn(`PATH ${k.at}: aims at the sky`, k);
  }
}

/**
 * Splines through the waypoints instead of lerping each leg on its own. Easing
 * every segment separately brings the camera to a halt at each waypoint and
 * accelerates out of it, which reads as a lurch between beats; one curve through
 * all of them keeps the speed continuous. Centripetal, so it cannot bow outside
 * the points it threads (leaves, umbrella) the way a uniform spline does.
 *
 * Position only. The look targets are far apart and wildly different in height
 * (-10.6 out at sea, then 2.1 at the girl's head), so a spline leaves the girl
 * with a steep upward tangent and throws the aim into the sky on the way to the
 * palm. A straight lerp keeps the target between the two waypoints it is
 * travelling between, which is what aiming wants.
 */
const POS_CURVE = new THREE.CatmullRomCurve3(
  PATH.map((k) => new THREE.Vector3(...k.pos)),
  false,
  "centripetal",
);

function Rig({ progress, still }: { progress: RefObject<number>; still: boolean }) {
  const look = useRef(new THREE.Vector3(...PATH[0].look));
  const pos = useRef(new THREE.Vector3(...PATH[0].pos));

  // The camera comes off the frame state rather than useThree: the fov write
  // below mutates it, and the compiler rightly refuses that on a value captured
  // from the render scope.
  useFrame((state, delta) => {
    const camera = state.camera as THREE.PerspectiveCamera;
    const p = THREE.MathUtils.clamp(progress.current, 0, 1);
    let i = 0;
    while (i < PATH.length - 2 && p > PATH[i + 1].at) i++;
    const a = PATH[i];
    const b = PATH[i + 1];
    const k = THREE.MathUtils.clamp((p - a.at) / (b.at - a.at || 1), 0, 1);
    // Position along the whole curve, not eased within the leg: the waypoint
    // spacing carries the timing, the spline carries the smoothness.
    const u = (i + k) / (PATH.length - 1);

    POS_CURVE.getPoint(u, pos.current);
    look.current.set(
      THREE.MathUtils.lerp(a.look[0], b.look[0], k),
      THREE.MathUtils.lerp(a.look[1], b.look[1], k),
      THREE.MathUtils.lerp(a.look[2], b.look[2], k),
    );

    const drift = still ? 0 : Math.sin(state.clock.elapsedTime * 0.4) * 0.12;
    const px = pos.current.x + state.pointer.x * 0.5;
    const py = pos.current.y + drift + state.pointer.y * 0.2;

    camera.position.set(
      THREE.MathUtils.damp(camera.position.x, px, 5, delta),
      THREE.MathUtils.damp(camera.position.y, py, 5, delta),
      THREE.MathUtils.damp(camera.position.z, pos.current.z, 5, delta),
    );
    camera.lookAt(look.current);

    const fov = THREE.MathUtils.lerp(a.fov ?? BASE_FOV, b.fov ?? BASE_FOV, k);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix(); // fov is a projection value, not a transform
    }
  });

  return null;
}

/**
 * Reports that the scene is actually on screen. Rendered inside the Suspense
 * boundary, so it only mounts once every model below has finished loading and
 * parsing: React commits a boundary in one go. Signalling from the component
 * body instead just says "BeachScene rendered", which is true long before there
 * is anything to look at.
 */
function Ready({ onReady }: { onReady?: () => void }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const setFrameloop = useThree((s) => s.setFrameloop);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    let live = true;
    // NB: setFrameloop alone is not enough. r3f re-applies the Canvas's
    // frameloop prop on every reconcile, so the onReady state update below
    // would reset it to "never" and stop the loop again on the next frame -
    // which froze the scene and left scroll scrubbing a camera nobody drew.
    // The prop is driven off the same signal; see `running` in BeachScene.
    //
    // The scene needs sixteen shader programs and the driver takes about
    // 130ms over each. Render immediately and three reads their uniforms one
    // at a time, and every read blocks until that program has finished
    // linking: two seconds of frozen main thread. Left alone the driver links
    // them all at once on its own threads, so the loop stays off (the still is
    // over the canvas anyway) until compileAsync says they are ready.
    const go = () => {
      if (!live) return;
      // setFrameloop only writes the mode and restarts the clock. The render
      // loop itself stopped when the canvas mounted on "never", and nothing
      // starts it again until something asks for a frame, so scroll would
      // scrub a camera nobody was drawing.
      setFrameloop("always");
      invalidate();
      onReady?.();
    };
    gl.compileAsync(scene, camera).then(go, go);
    return () => {
      live = false;
    };
  }, [gl, scene, camera, setFrameloop, invalidate, onReady]);

  return null;
}

/**
 * Feeds the loader real load progress. Lives outside the Suspense boundary so
 * it keeps rendering while the models below it are still in flight, and writes
 * to a ref rather than state: this fires once per asset and the loader reads it
 * from its own rAF loop, so a React render per file would buy nothing.
 */
function Progress({ outRef }: { outRef?: RefObject<number> }) {
  const { progress } = useProgress();
  useEffect(() => {
    if (outRef) outRef.current = progress;
  }, [progress, outRef]);
  return null;
}

/* ----------------------------------------------------------------- scene */

// Material names come from shack.glb. Glass is left alone. Module scope: a fresh
// object each render would re-clone every material on every frame.
const SHACK_PAINT = {
  Red_Wood_Material: "#c0392b",   // walls
  Roof_Tiles_Material: "#f6f3ec", // roof
  White_Wood_Material: "#f6f3ec", // doors and frames
};

const SHACK_BLUE = { ...SHACK_PAINT, Red_Wood_Material: "#4169e1" };

export default function BeachScene({
  progress,
  still = false,
  onReady,
  loadPct,
}: {
  progress: RefObject<number>;
  still?: boolean;
  onReady?: () => void;
  loadPct?: RefObject<number>;
}) {
  const get = fileFor;
  // Off until the shaders are linked; Ready flips this. It has to be the prop
  // and not just setFrameloop, because r3f re-applies the prop on reconcile.
  const [running, setRunning] = useState(false);
  const ready = useCallback(() => {
    setRunning(true);
    onReady?.();
  }, [onReady]);

  return (
    <Canvas
      dpr={[1, 1.75]}
      frameloop={running ? "always" : "never"}
      // fov 40, not 46: at 46 a near object at the edge of frame splays visibly
      // away from centre, which read as the shacks leaning. A longer lens keeps
      // their walls vertical.
      camera={{ position: [0, 4.2, 26], fov: BASE_FOV, near: 0.1, far: 700 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ scene, gl }) => {
        scene.fog = new THREE.Fog(0xa9c6d6, 300, 640);
        // three reads LINK_STATUS and the info log the first time each program
        // is used, which blocks the main thread until the driver has finished
        // linking it. Across this many materials that is seconds of stall on
        // the frame the models land. Keep the check in dev, where a broken
        // shader should say so; drop it in the build users get.
        gl.debug.checkShaderErrors = process.env.NODE_ENV !== "production";
      }}
    >
      {/* Matched to the dusky blue at the top of sunset.jpg, not a pale sky blue:
          the plate now covers the frame, but on an unusually wide or tall
          viewport any sliver that escapes it blends instead of flashing. */}
      <color attach="background" args={["#6f92b8"]} />
      {/* Daylight: bright even fill so the models read in their own colours,
          with a warm sun key from the horizon behind. */}
      <ambientLight intensity={1.0} color="#ffe9d2" />
      <hemisphereLight args={["#ffd9ad", "#7d8fa0", 0.9]} />
      <directionalLight position={[0, 12, -160]} intensity={2.1} color="#ffcf94" />
      <directionalLight position={[-14, 9, 18]} intensity={0.5} color="#cfe4f2" />

      <Suspense fallback={null}>
        <SkyImage />
      </Suspense>
      <Rig progress={progress} still={still} />
      <Progress outRef={loadPct} />

      <Suspense fallback={null}>
        <Sea url={get("water")} still={still} />
        <Sand url={get("sand")} />
        {get("boat") && (
          <Cluster
            url={get("boat")!}
            target={2.6}
            spots={[[-16, SEA_LEVEL + 0.4, -34, 0.5], [-27, SEA_LEVEL + 0.4, -48, -0.3]]}
          />
        )}
        {get("shack") && (
          <Cluster
            url={get("shack")!}
            target={4.5}
            tint={SHACK_PAINT}
            spots={[[11.5, 0, 12, -0.35]]}
          />
        )}
        {/* Same hut, own cluster: the blue paint is per-cluster, not per-copy.
            Bottom-left of frame is close to the camera, and the frustum narrows
            as it approaches: at z = 17 the camera only sees |x| < 8, so a small
            x here reads as the left edge. Ground nearer than ~7 units drops off
            the bottom of the screen entirely. */}
        {get("shack") && (
          <Cluster url={get("shack")!} target={4.5} tint={SHACK_BLUE} spots={[[-10.5, 0, 14, 0.45]]} />
        )}
        {get("girl") && (
          // 0.3 rad, not 0: she stands left of centre, so facing straight down
          // +z would turn her shoulder to a camera that sits up and to her right.
          <Girl url={get("girl")!} still={still} spot={[-3.5, 16.5, 0]} scale={1.2} />
        )}
        {get("kit") && (
          <Cluster
            url={get("kit")!}
            // 8.5 across, not 7: the model measures widest across the whole
            // spread of chairs and towel, so its umbrella is only a quarter of
            // that tall. 8.5 gives the camera room to pass under the canopy.
            target={8.5}
            axis="x"
            // Down by the waterline (sand starts at z = 0), turned to face the
            // sun: the light and the sky plate both sit at -z, so pi points the
            // chairs out to sea. Flip to 0 if the model's front faces the other way.
            spots={[
              [-9, 0, 3.5, Math.PI + 0.12],
              [-4, 0, 2.5, Math.PI + 0.3],
            ]}
          />
        )}
        {get("mountain") && (
          <Cluster url={get("mountain")!} target={11} spots={[
            [-46, SEA_LEVEL, -150, 0.3], [52, SEA_LEVEL, -152, -0.5],
            [-88, SEA_LEVEL, -158, 1.1], [92, SEA_LEVEL, -160, 2.0],
          ]} />
        )}
        {get("surf") && (
          <Cluster
            url={get("surf")!}
            // axis x measures the board's length, not the thickness a flat board
            // shows on y. tilt z of 90 degrees stands that length upright; the
            // rotation pivots on the sand, so the spots lift by half the length
            // (1.6) less 0.3, which plants the tail in the sand.
            target={3.2}
            axis="x"
            tilt={[0, 0, Math.PI / 2 + 0.06]}
            spots={[[6.5, 1.3, 4, 0.35], [8.8, 1.3, 4.6, 0.1]]}
          />
        )}
        {get("palm") && <Palms url={get("palm")!} />}
        {/* Last, and only if something above it can suspend: with no models
            listed it would report ready instantly. */}
        {MODELS.length > 0 && <Ready onReady={ready} />}
      </Suspense>
    </Canvas>
  );
}
