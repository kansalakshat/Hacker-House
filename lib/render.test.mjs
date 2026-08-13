/* Self-check for the pure bits of lib/render.ts:  node lib/render.test.mjs */
import assert from "node:assert/strict";
import { fitCover, builderTitle, builderCode, CROP0 } from "./render.ts";

// --- fitCover always covers the box, whatever the source aspect ---
for (const [iw, ih] of [[4000, 3000], [3000, 4000], [1000, 1000], [6000, 1000], [200, 900]]) {
  const r = fitCover(iw, ih, 1000, 1000, CROP0);
  assert.ok(r.dw >= 1000 - 1e-6 && r.dh >= 1000 - 1e-6, `too small ${iw}x${ih}`);
  assert.ok(r.dx <= 1e-6 && r.dy <= 1e-6, `gap top/left ${iw}x${ih}`);
  assert.ok(r.dx + r.dw >= 1000 - 1e-6, `gap right ${iw}x${ih}`);
  assert.ok(r.dy + r.dh >= 1000 - 1e-6, `gap bottom ${iw}x${ih}`);
  assert.ok(Math.abs(r.dw / r.dh - iw / ih) < 1e-9, `aspect skew ${iw}x${ih}`);
}

// --- portraits are anchored above centre so faces survive the crop ---
const portrait = fitCover(1000, 2000, 1000, 1000, CROP0);
const landscape = fitCover(2000, 1000, 1000, 1000, CROP0);
assert.ok(portrait.dy > (1000 - portrait.dh) / 2, "portrait should bias upward");
assert.equal(landscape.dx, (1000 - landscape.dw) / 2, "landscape stays centred");

// --- extreme nudges still cannot open a gap ---
for (const c of [{ zoom: 1, x: -9, y: 9 }, { zoom: 4, x: 9, y: -9 }, { zoom: 0.1, x: 0, y: 0 }]) {
  const r = fitCover(1600, 900, 800, 800, c);
  assert.ok(r.dx <= 1e-6 && r.dx + r.dw >= 800 - 1e-6, "x gap");
  assert.ok(r.dy <= 1e-6 && r.dy + r.dh >= 800 - 1e-6, "y gap");
}

// --- titles are stable, and vary with input ---
assert.equal(builderTitle("Asha Menon", "Rust"), builderTitle("  asha menon ", "rust"));
assert.notEqual(builderTitle("Asha Menon", "Rust"), builderTitle("Asha Menon", "Solidity"));
assert.notEqual(builderTitle("Asha Menon", "Rust"), builderTitle("Asha Menon", "Rust", 1));
assert.match(builderTitle("Asha Menon", "Rust"), /^[A-Z-]+ [A-Z ]+$/);
assert.match(builderCode("Asha Menon", "Rust"), /^HHG26-[0-9A-F]{4}$/);

// --- the generator actually spreads across the pool ---
const seen = new Set();
for (let i = 0; i < 400; i++) seen.add(builderTitle("builder" + i, "stack" + (i % 7)));
assert.ok(seen.size > 120, `weak spread: ${seen.size}`);

console.log("render self-check ok");
