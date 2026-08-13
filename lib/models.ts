/**
 * The 3D models the beach is built from, and their attribution.
 *
 * Plain data, kept out of BeachScene so the footer can credit them without
 * pulling three.js into the page bundle. Drop a file into public/ and add its
 * entry here and that layer appears, credited automatically.
 */

export type Slot =
  | "palm" | "water" | "kit" | "boat" | "shack" | "sand"
  | "mountain" | "surf" | "girl";

export type Credit = {
  slot: Slot;
  file: string;
  title: string;
  author: string;
  license: string;
  url: string;
};

export const MODELS: Credit[] = [
  {
    slot: "palm", file: "/palm.glb", title: "Coconut Palm", author: "evolveduk",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/coconut-palm-26e787f2ff2e4c0fb004c3b0210805a3",
  },
  {
    slot: "water", file: "/water.glb", title: "Water Animation", author: "Artise1",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/water-animation-e54ff76bef854b128af8d20cf9c03729",
  },
  {
    slot: "kit", file: "/beach.glb", title: "Beach kit", author: "Jungle Jim",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/beach-kit-6e0e5cc33a1542679f8383e9e260eb90",
  },
  {
    slot: "sand", file: "/sand.glb", title: "Low Poly Beach", author: "Helyx Silveira",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/low-poly-beach-bcf6ba0ecb23410f9aa02f897a77e2df",
  },
  {
    slot: "shack", file: "/shack.glb", title: "Simple Beach Hut", author: "rhcreations",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/simple-beach-hut-30c9c1fcd854479e84ad107de24d325f",
  },
  {
    slot: "boat", file: "/boat.glb", title: "Small Boats", author: "spacelynxcanfly",
    license: "CC BY 4.0",
    url: "https://sketchfab.com/3d-models/small-boats-4b34c6fabe3b4a27a0490edb91d9a4e5",
  },
  {
    slot: "mountain", file: "/mountain.glb", title: "Mountain", author: "",
    license: "CC BY 4.0", url: "",
  },
  {
    slot: "surf", file: "/surf.glb", title: "Surfboards", author: "",
    license: "CC BY 4.0", url: "",
  },
  {
    slot: "girl", file: "/girl.glb", title: "Girl", author: "",
    license: "CC BY 4.0", url: "",
  },
];
