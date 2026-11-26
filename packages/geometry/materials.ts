import type {Voxel} from "./voxels.ts";

function latticeValue(x: number, z: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1274126177);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Smoothly interpolated values on a seeded 2D lattice. The caller sets the patch scale. */
export function valueNoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const ease = (t: number) => t*t*(3-2*t);
  const lerp = (a: number, b: number, t: number) => a+(b-a)*t;
  const u = ease(x-ix), v = ease(z-iz);
  return lerp(lerp(latticeValue(ix,iz,seed),latticeValue(ix+1,iz,seed),u),
    lerp(latticeValue(ix,iz+1,seed),latticeValue(ix+1,iz+1,seed),u),v);
}

export type Weathering = "none" | "subtle" | "weathered";
export const weatheringPalette = {wet:"tuff_bricks", transition:"polished_tuff", highlight:"smooth_stone"} as const;
export const weatheringMaterials: readonly string[] = Object.freeze(Object.values(weatheringPalette));

export interface StoneWeathering {
  strength: Weathering;
  /** Water surface and foundation heights in the same coordinates as the sampled stone. */
  waterline: number | null;
  foundation: number;
  seed?: number;
  role?: "masonry" | "tread";
}

/** Paint an existing masonry voxel. Coherent patches follow the water height or dry footing. */
export function weatheredStone(point: Voxel, base: string, options: StoneWeathering): string {
  if (options.strength === "none" || options.role === "tread") return base;
  const {x,y,z} = point;
  const patch = valueNoise((x + 0.38*y)/3.7, (z - 0.52*y)/3.7, options.seed ?? 42);
  // Both strengths use the same field. Reducing the strength retains the cores of existing patches.
  if (patch < (options.strength === "subtle" ? 0.52 : 0.20)) return base;
  const above = y - (options.waterline ?? options.foundation);
  const variation = (patch - 0.5)*3;
  if (options.waterline !== null) {
    if (above <= 0.8 + variation) return weatheringPalette.wet;
    if (above <= 2.3 + variation) return weatheringPalette.transition;
  } else if (above <= 1.2 + variation && patch >= 0.43) {
    return weatheringPalette.transition;
  }
  const highlightThreshold = 0.55 - Math.min(0.22,0.07*Math.max(0,above-3));
  if (above >= 3.5 + variation && patch >= highlightThreshold) return weatheringPalette.highlight;
  return base;
}
