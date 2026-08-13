"use client";

/**
 * 3D preview of the generated pass, standing in a night-Goa scene.
 *
 * The flat 2D canvas stays the source of truth for download and share; this
 * scene maps it onto a physical card so the badge reads as an object you would
 * wear rather than a rectangle. Loaded via next/dynamic so three.js never
 * enters the bundle for anyone who stays on the flat preview.
 *
 * Scenery is optional and additive: drop the GLBs listed in MODELS into
 * public/ and each one appears. All are CC-BY, so whatever actually loads gets
 * credited in the UI via `onScenery`.
 */

import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, RoundedBox, useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";

const YELLOW = "#fee13c";
const INK = "#03080a";
const PINK = "#ff0080";

export type Credit = {
  key: "palm" | "water" | "kit" | "scene";
  file: string;
  title: string;
  author: string;
  license: string;
  url: string;
};

export const MODELS: Credit[] = [
  {
    key: "palm",
    file: "/palm.glb",
    title: "Coconut Palm",
    author: "evolveduk",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/coconut-palm-26e787f2ff2e4c0fb004c3b0210805a3",
  },
  {
    key: "water",
    file: "/water.glb",
    title: "Water Animation",
    author: "Artise1",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/water-animation-e54ff76bef854b128af8d20cf9c03729",
  },
  {
    key: "scene",
    file: "/beach-scan.glb",
    title: "Ibiza Benirras Beach at Sunset",
    author: "Miguelangelo Rosario",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/ibiza-benirras-beach-at-sunset-9298c3a7f2384a93ae8f387ae99a85a1",
  },
  {
    key: "kit",
    file: "/beach.glb",
    title: "Beach kit",
    author: "Jungle Jim",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/beach-kit-6e0e5cc33a1542679f8383e9e260eb90",
  },
];

/**
 * Scale an arbitrary model to a known size. `axis` picks which dimension the
 * target applies to, and `onBase` plants it on its own bottom rather than its
 * centre, so scenery sits on the waterline instead of hovering.
 */
function normalise(obj: THREE.Object3D, target: number, axis: "y" | "x", onBase: boolean) {
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const ref = axis === "y" ? Math.max(size.x, size.y, size.z) : Math.max(size.x, size.z);
  const s = target / (ref || 1);
  obj.scale.setScalar(s);
  obj.position.set(-centre.x * s, onBase ? -box.min.y * s : -centre.y * s, -centre.z * s);
  return obj;
}

function Palms({ url, still }: { url: string; still: boolean }) {
  const { scene } = useGLTF(url);
  const { viewport } = useThree();
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  // The stage can be a narrow portrait box, so spread from the actual frustum
  // rather than fixed world units.
  const spread = Math.max(1.6, viewport.width * 0.62);
  const height = Math.max(2.4, viewport.height * 0.9);

  // A three.js object can only have one parent, so the second palm is a clone.
  const [a, b] = useMemo(
    () => [
      normalise(scene.clone(true), height, "y", true),
      normalise(scene.clone(true), height, "y", true),
    ],
    [scene, height],
  );

  useFrame((state) => {
    if (still) return;
    const t = state.clock.elapsedTime;
    if (left.current) left.current.rotation.z = Math.sin(t * 0.6) * 0.035;
    if (right.current) right.current.rotation.z = Math.sin(t * 0.6 + 1.4) * -0.035;
  });

  return (
    <group position={[0, -viewport.height * 0.5, -3.4]}>
      <group ref={left} position={[-spread, 0, 0]}>
        <primitive object={a} />
      </group>
      <group ref={right} position={[spread, 0, 0.7]} scale={[-0.85, 0.85, 0.85]}>
        <primitive object={b} />
      </group>
    </group>
  );
}

function Water({ url, still }: { url: string; still: boolean }) {
  const { scene, animations } = useGLTF(url);
  const host = useRef<THREE.Group>(null);
  const { actions } = useAnimations(animations, host);

  const model = useMemo(() => {
    const clone = scene.clone(true);
    const size = new THREE.Box3().setFromObject(clone).getSize(new THREE.Vector3());
    // Some water planes are authored upright; lay them flat if so.
    if (size.y > Math.min(size.x, size.z)) clone.rotation.x = -Math.PI / 2;
    return normalise(clone, 18, "x", false);
  }, [scene]);

  useEffect(() => {
    if (still) return;
    const playing = Object.values(actions).filter(Boolean) as THREE.AnimationAction[];
    playing.forEach((a) => a.reset().setLoop(THREE.LoopRepeat, Infinity).play());
    return () => playing.forEach((a) => a.stop());
  }, [actions, still]);

  return (
    <group ref={host} position={[0, -2.2, -1.5]}>
      <primitive object={model} />
    </group>
  );
}

function BeachKit({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => normalise(scene.clone(true), 9, "x", true), [scene]);
  return (
    <group position={[0, -2.15, -5.2]}>
      <primitive object={model} />
    </group>
  );
}

/** A whole scanned environment, pushed back so the card still reads. */
function Scanned({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => normalise(scene.clone(true), 26, "x", true), [scene]);
  return (
    <group position={[0, -2.4, -9]}>
      <primitive object={model} />
    </group>
  );
}

function Card({
  sourceRef,
  revision,
  aspect,
  still,
}: {
  sourceRef: RefObject<HTMLCanvasElement | null>;
  revision: RefObject<number>;
  aspect: number;
  still: boolean;
}) {
  const group = useRef<THREE.Group>(null);
  const face = useRef<THREE.MeshStandardMaterial>(null);
  const texture = useRef<THREE.CanvasTexture | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const seen = useRef(-1);
  const { viewport } = useThree();

  // Fit the card to the viewport with a margin, whatever its aspect.
  const margin = 0.78;
  const h = Math.min(viewport.height * margin, (viewport.width * margin) / aspect);
  const w = h * aspect;

  useEffect(() => () => texture.current?.dispose(), []);

  useFrame((state, delta) => {
    // Bind the flat canvas lazily: reading a ref is only safe outside render.
    // Switching format resizes that canvas, and three keeps the GPU allocation
    // at the old dimensions, so a resize needs a genuinely new texture.
    const src = sourceRef.current;
    if (src && (!texture.current || size.current.w !== src.width || size.current.h !== src.height)) {
      texture.current?.dispose();
      const t = new THREE.CanvasTexture(src);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      texture.current = t;
      size.current = { w: src.width, h: src.height };
      seen.current = -1;
      if (face.current) {
        face.current.map = t;
        face.current.needsUpdate = true;
      }
    }
    // Re-upload only when the artwork actually changed.
    if (texture.current && seen.current !== revision.current) {
      seen.current = revision.current;
      texture.current.needsUpdate = true;
    }

    if (!group.current || still) return;
    const { x, y } = state.pointer;
    group.current.rotation.y = THREE.MathUtils.damp(group.current.rotation.y, x * 0.5, 4, delta);
    group.current.rotation.x = THREE.MathUtils.damp(group.current.rotation.x, -y * 0.32, 4, delta);
  });

  return (
    <group ref={group}>
      <RoundedBox args={[w, h, 0.055]} radius={Math.min(w, h) * 0.045} smoothness={5}>
        <meshStandardMaterial color={INK} roughness={0.55} metalness={0.15} />
      </RoundedBox>

      <mesh position={[0, 0, 0.03]}>
        <planeGeometry args={[w * 0.99, h * 0.99]} />
        <meshStandardMaterial
          ref={face}
          color="#ffffff"
          roughness={0.42}
          metalness={0.06}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[0, 0, -0.03]}>
        <planeGeometry args={[w * 0.99, h * 0.99]} />
        <meshStandardMaterial color={YELLOW} roughness={0.7} metalness={0.2} />
      </mesh>

      {/* lanyard strap, only on the tall badge */}
      {aspect < 0.8 && (
        <>
          <mesh position={[-w * 0.13, h * 0.78, 0]} rotation={[0, 0, 0.34]}>
            <planeGeometry args={[w * 0.075, h * 0.62]} />
            <meshStandardMaterial color={YELLOW} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
          <mesh position={[w * 0.13, h * 0.78, 0]} rotation={[0, 0, -0.34]}>
            <planeGeometry args={[w * 0.075, h * 0.62]} />
            <meshStandardMaterial color={YELLOW} side={THREE.DoubleSide} roughness={0.9} />
          </mesh>
        </>
      )}
    </group>
  );
}

export default function PassScene({
  sourceRef,
  revision,
  aspect,
  still = false,
  onScenery,
}: {
  sourceRef: RefObject<HTMLCanvasElement | null>;
  revision: RefObject<number>;
  aspect: number;
  still?: boolean;
  onScenery?: (loaded: Credit[]) => void;
}) {
  const [present, setPresent] = useState<Credit[]>([]);

  // Only mount loaders for models that have actually been dropped in.
  useEffect(() => {
    let live = true;
    Promise.all(
      MODELS.map(async (m) => {
        try {
          const r = await fetch(m.file, { method: "HEAD" });
          const html = (r.headers.get("content-type") || "").includes("text/html");
          return r.ok && !html ? m : null;
        } catch {
          return null;
        }
      }),
    ).then((found) => {
      if (!live) return;
      const list = found.filter(Boolean) as Credit[];
      setPresent(list);
      onScenery?.(list);
    });
    return () => {
      live = false;
    };
  }, [onScenery]);

  const has = (k: Credit["key"]) => present.find((m) => m.key === k);

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 4.2], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[3, 4, 5]} intensity={2.1} />
      <pointLight position={[-3.5, -1, 2.5]} intensity={22} color={YELLOW} distance={12} />
      <pointLight position={[3.5, 2, -1.5]} intensity={14} color={PINK} distance={12} />

      <Suspense fallback={null}>
        {has("scene") && <Scanned url={has("scene")!.file} />}
        {has("water") && <Water url={has("water")!.file} still={still} />}
        {has("kit") && <BeachKit url={has("kit")!.file} />}
        {has("palm") && <Palms url={has("palm")!.file} still={still} />}
        <Float
          speed={still ? 0 : 1.5}
          rotationIntensity={still ? 0 : 0.22}
          floatIntensity={still ? 0 : 0.5}
          floatingRange={[-0.06, 0.06]}
        >
          <Card sourceRef={sourceRef} revision={revision} aspect={aspect} still={still} />
        </Float>
      </Suspense>
    </Canvas>
  );
}
